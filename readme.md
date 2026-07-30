# NeuralOps Nexus

A self-hosted team workspace where every conversation can pull in an AI persona — backed by a plain LLM or an agent with tool access (MCP servers) — right in the chat. Projects → Channels → Topics, human members and AI personas side by side, `@mention` to trigger a persona, `@directive` to shape its output (chart, table, diagram, form...).

## Architecture at a glance

| Service | What it does | Stack |
|---|---|---|
| `nucleus` | Orchestrator — auth, workspace, chat, REST API | Django + Django Ninja |
| `nexus-ai` | AI worker — runs the LLM/agent, embeddings, MCP tool calls | FastAPI + LiteLLM + pydantic-ai |
| `realtime` | Real-time transport — message delivery to the browser | Centrifugo |
| `nginx` | Reverse proxy — single entry point (`/api/`, `/admin/`, websocket) | nginx |
| `postgres` | Relational data | PostgreSQL 17 |
| `chromadb` | Vector store for embeddings / semantic context search | ChromaDB |
| `redis` | Celery broker + Centrifugo engine | Redis 7 |
| `neuralops-react-app` | Web UI (also deployable standalone to Vercel) | TanStack Start + React |
| `mcps/` | Optional first-party MCP tool servers (SerpAPI, Odoo ERP, filesystem) | FastMCP |

Full REST endpoint reference: see `neuralops-backend-api-catalog.md` if present in your working folder, or regenerate it from the `api.py` files under `modules/nexus-nucleus/*/`.

---

## 1. Install — Docker Compose

**Prerequisites:** Docker & Docker Compose, Git.

```bash
git clone git@github.com:mapax-io/neuralops-nexus-backend.git
cd neuralops-nexus-backend
git checkout dev   # active development branch

cp sample-example.env .env
```

Edit `.env` and fill in at minimum:

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `POSTGRES_URL` | Full asyncpg URL used by nucleus |
| `CENTRIFUGO_API_KEY` / `CENTRIFUGO_HMAC_SECRET` | Real-time transport secrets — any random strings |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | At least one, for your first AI model |
| `NEXUS_AI_URL` | Internal URL nucleus uses to reach nexus-ai (`http://nexus-ai:8000` by default) |
| `INTERNAL_API_KEY` | Shared secret between nucleus and nexus-ai — any random string |
| `FIELD_ENCRYPTION_KEY` | Encrypts stored model API keys — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` | Auth — NeuralOps uses Supabase for identity |
| `NEURALOPS_SERVER_URL` | The URL *other people* will use to reach your server (see §3) |

`SERPAPI_KEY`, `ERP_*`, `SSH_*` are only needed if you're using the matching MCP tool server (§6).

Build and run:

```bash
# Apple Silicon (M-series)
ARCH=arm64 docker compose build --no-cache
docker compose up -d

# x86 / AMD64
docker compose build
docker compose up -d
```

`docker compose ps` should show `nucleus`, `nucleus-celery`, `redis`, `nexus-ai`, `realtime`, `nginx`, `chromadb`, `postgres` (and `neuralops-react-app` if you're running the frontend locally — see §4). Data persists in `./data/postgres_data` and `./data/chroma_data`.

## 2. First-run setup — create the owner

Migrate the database and create the first user (the "owner" of this server):

```bash
docker compose exec nucleus python manage.py migrate
docker compose exec nucleus python manage.py create_owner
```

`create_owner` is interactive. It needs a **Supabase account already created at the NeuralOps sign-up page** — if you don't have one yet it'll tell you to sign up first, then run the command again. Once verified, it creates your workspace and grants you the Owner role (full permissions; Admin/Member/Viewer groups are also created automatically for inviting others later).

## 3. Exposing your server

You have two options, depending on whether you want to use the hosted frontend or run everything locally.

### Option A — Public URL via Tailscale (use with a hosted frontend, e.g. a Vercel deployment)

If you want to connect a browser-based frontend (like a Vercel-hosted deploy of `neuralops-react-app`) to your self-hosted backend without opening ports on your router:

```bash
# Install Tailscale and join your tailnet
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Expose nginx (port 80) publicly over HTTPS via Tailscale Funnel
sudo tailscale funnel --bg 80
```

This gives you a public `https://<machine-name>.<your-tailnet>.ts.net` URL that proxies straight to nginx → nucleus. Set that as `NEURALOPS_SERVER_URL` in `.env` and restart `nucleus` so `GET /api/v1/auth/config/` reports it correctly, then:

1. Open the frontend (e.g. wherever your `neuralops-nexus-demo...` deployment lives).
2. Sign in with your Supabase account.
3. Use the "add server" / connect flow and paste your Tailscale Funnel URL.
4. The frontend calls `GET /api/v1/auth/verify/` against that URL to confirm access.

`tailscale funnel status` shows the active funnel; `tailscale funnel --bg 80 off` (or `tailscale funnel reset`) tears it down.

### Option B — Fully local, no Tailscale (run backend + frontend together)

If you just want everything running on your own machine, `neuralops-react-app` is already a normal service in `docker-compose.yaml` — no separate setup needed:

```bash
docker compose up -d --build neuralops-react-app
```

Then set `NEURALOPS_SERVER_URL=http://localhost` (or your machine's LAN IP if you want other devices on your network to reach it, e.g. `http://192.168.1.90`) in `.env`, restart `nucleus`, and open the React app's port directly in the browser. Nothing leaves your machine/network — no Tailscale, no public exposure.

If you're running the backend and frontend on different ports on the same box (e.g. testing a second instance alongside a production one), just remap the host-side ports in `docker-compose.yaml` and update `NEURALOPS_SERVER_URL` to match.

---

## 4. Using NeuralOps

Everything below is driven from inside the chat itself — type `/` in the message box to see all available commands, or `@` to mention a persona or attach context.

### Add your first AI model

Type **`/add-model`** in any chat. You'll need:

| Field | Notes |
|---|---|
| Name | Display name, e.g. "GPT-4o" |
| Model ID | LiteLLM format, e.g. `gpt-4o`, `anthropic/claude-haiku-4-5-20251001` |
| API Base URL | Optional — only for custom/self-hosted endpoints |
| API Key | Stored encrypted (`FIELD_ENCRYPTION_KEY`) |
| Terms of service checkbox | Required before saving |

`/list-models` shows everything you've registered.

### Add an MCP server

*No MCP servers are configured on this server by default.* Type **`/add-mcp`** and provide:

| Field | Notes |
|---|---|
| Name | e.g. "Odoo ERP" |
| URL | The server's `/mcp` endpoint |
| Transport | `streamable-http` (default), `sse`, or `stdio` |
| Server Type | Remote or Local |

The `mcps/` folder ships three ready-to-run example servers (SerpAPI shopping, Odoo ERP, filesystem) you can spin up with `cd mcps && docker compose up -d` and then register here. **Important:** when a persona actually calls a tool, the request comes from inside the `nexus-ai` container — register the MCP server's URL using your host's real IP (e.g. `http://192.168.1.90:9044/mcp`), not `localhost`, or tool calls will fail with connection refused. `/list-mcps` shows everything registered.

### Add an agent

An agent pairs a model with an MCP server so a persona built on it can call tools. Type **`/add-agent`**:

| Field | Notes |
|---|---|
| Name | e.g. "ERP Agent" |
| AI Model | Required — pick from your registered models |
| MCP Server | Optional — pick one, or None for a plain-LLM agent |
| System Prompt | Optional instructions |

`/list-agents` to review.

### Add a persona

Personas are what you `@mention` in chat. Type **`/add-persona`**:

| Field | Notes |
|---|---|
| Name | Used as the `@mention`, e.g. "Layla" → `@Layla` |
| Backed by | **Agent** (model + tools) or **Model directly** (plain LLM, no tools) |
| System Prompt | Defaults to "You are {name}, a helpful AI assistant." |

`/list-personas` to review or manage existing ones.

### Invite a user

Type **`/invite`** followed by either an `@PersonaName` or an email address:

```
/invite @Layla                        → adds the persona to this project
/invite someone@example.com           → invites them to this topic
/invite someone@example.com project   → invites them to the whole project
```

New users get an emailed invite link; existing workspace users are added directly.

### Create a project, channel, and topic

- **Project:** click **+** next to Projects in the sidebar → name + optional description.
- **Channel:** inside a project, **+** next to Channels → name + optional description.
- **Topic:** inside a channel, **+** next to Topics → title. This is the actual conversation thread.

### Talk to a persona

`@mention` any persona in a message to trigger it:

```
@Layla summarize the last quarter's numbers
```

You can mention multiple personas at once, and add an output directive to shape the reply — `@chart`, `@table`, `@diagram`, `@form`, `@code`, `@terminal`, `@html`, or `@text`:

```
@Layla show me the sales trend @chart
```

### `@session` — keep talking without re-mentioning

Add `@session` to open a running session with whichever personas you just mentioned — every plain message after that (no `@mention` needed) goes to them automatically, until the session times out (default 30 min, configurable per company) or you close it:

```
@Layla @session let's dig into this together
...then just type normally, no @mention needed...
@session close        (or "@session end")
```

---

## 5. Contributing

Full step-by-step guide: **`how-to-contribute.md`**. Short version:

1. **Fork** [mapax-io/neuralops-nexus-backend](https://github.com/mapax-io/neuralops-nexus-backend) — uncheck "Copy only the main branch" so you get `dev` too.
2. **Clone your fork** and add upstream:
   ```bash
   git clone git@github.com:<your-username>/nexus-backend.git neuralops
   cd neuralops
   git remote add upstream https://github.com/mapax-io/neuralops-nexus-backend.git
   ```
3. **Branch off `dev`** — never commit directly to `main` or `dev`:
   ```bash
   git checkout -b feature/<short-name>     # or issue/<short-name> for bug fixes
   ```
4. **Commit** with a descriptive message (include the task/issue ID and what changed):
   ```bash
   git commit -m "feat(ID-123): implement user auth module — JWT validation in apps/auth.py"
   ```
5. **Push to your fork** and open a Pull Request against **`dev`** (not `main`) with a full description: what changed, which files, why this approach, and anything you want the reviewer to focus on.
6. **Post in Discord** with a link to the PR and a one-line summary. A maintainer will review, may ask questions or request changes, and — once approved — merge it into `dev`.

> **Branch notice:** `dev` is the active branch — clone and build from it. `master` is legacy and pending deprecation; don't deploy from it.
