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

## 1. Install — Docker Compose (dev profile)

**Prerequisites:** Docker & Docker Compose, Git.

```bash
git clone git@github.com:mapax-io/neuralops-nexus-backend.git
cd neuralops-nexus-backend
git checkout staging   # branch with the current dev-profile compose setup

cp .env.example .env
```

```
docker build -f modules/nexus-nucleus/docker/dev/Dockerfile.nexus-nucleus . --no-cache
docker build -t nexus-backend:5.0 -f modules/nexus-nucleus/docker/dev/Dockerfile.nexus-nucleus . --no-cache
docker build -t nexus-ai:2.0 -f modules/nexus-ai/docker/dev/Dockerfile.nexus-ai . --no-cache
```

`.env` is gitignored on purpose — `.env.example` is the git-tracked template every fresh clone starts from. `COMPOSE_PROFILES=dev` is already set in it, so a bare `docker compose up` selects the right profile with no `--profile`/`-f` flags needed. Edit `.env` and fill in the blank `DEV_*` values — `.env.example` documents each one inline, but at minimum:

| Variable | Purpose |
|---|---|
| `DEV_POSTGRES_USER` / `DEV_POSTGRES_PASSWORD` / `DEV_POSTGRES_DB` / `DEV_POSTGRES_URL` | Database credentials |
| `DEV_FIELD_ENCRYPTION_KEY` | Encrypts stored model API keys — generate with `python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"` |
| `DEV_INTERNAL_API_KEY` / `DEV_CENTRIFUGO_API_KEY` / `DEV_CENTRIFUGO_HMAC_SECRET` / `DEV_NEURALOPS_INSTALL_TOKEN` | Shared secrets — any random string, e.g. `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `DEV_OPENAI_API_KEY` / `DEV_ANTHROPIC_API_KEY` | At least one, for your first AI model |
| `DEV_SUPABASE_SERVICE_KEY` | From your Supabase project settings → API (service_role key). `DEV_SUPABASE_URL`/`DEV_SUPABASE_ANON_KEY` are already filled in for you — those are public by design, safe to ship in a frontend bundle |
| `DEV_NEURALOPS_SERVER_URL` | The URL *other people* will use to reach your server, e.g. `http://192.168.1.90:8081` — defaults to `http://localhost:8081`, which only works for you locally |

Verify nothing required is still blank, then bring the stack up:

```bash
docker compose config      # confirm no ${DEV_...} shows up empty
docker compose up -d
```

`docker compose ps` should show all 9 `dev-*` containers up: `dev-nucleus`, `dev-celery`, `dev-redis`, `dev-nexus-ai`, `dev-transport`, `dev-nginx`, `dev-chroma`, `dev-postgres`, `dev-react-app`. Data persists in `./data/dev/`.

## 2. First-run setup

Run these once, in order, against a fresh database:

```bash
docker compose exec nucleus-dev python manage.py migrate
docker compose exec nucleus-dev python manage.py create_owner
docker compose exec nucleus-dev python manage.py seed_permissions
docker compose exec nucleus-dev python manage.py seed_avatars     # optional — populates the avatar pool (#148)
```

- `migrate` creates the schema.
- `create_owner` is interactive. It needs a **Supabase account already created at the NeuralOps sign-up page** — if you don't have one yet it'll tell you to sign up first, then run the command again. Once verified, it creates your workspace and grants you the Owner role (full permissions; Admin/Member/Viewer groups are also created automatically for inviting others later).
- `seed_permissions` seeds the RBAC right codes (`project.list`, `project.create`, etc.). Skip this and every permission check 500s with `Unknown right code`.
- `seed_avatars` fetches a pool of DiceBear avatar images so new users/personas get one assigned automatically on creation.

Then open `http://<your-server-ip>:3003` in a browser. Both port 3003 (frontend) and whatever `DEV_NGINX_HOST_PORT` is set to (default `8081`, the API) need to be reachable from wherever your browser is — same LAN, or whatever router/firewall/VPN rule you use for the rest of this server.

## 3. Exposing your server

You have two options, depending on whether you want to use the hosted frontend or run everything locally.

### Option A — Public URL via Tailscale (use with a hosted frontend, e.g. a Vercel deployment)

If you want to connect a browser-based frontend (like a Vercel-hosted deploy of `neuralops-react-app`) to your self-hosted backend without opening ports on your router:

```bash
# Install Tailscale and join your tailnet
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Expose nginx-dev (host port from DEV_NGINX_HOST_PORT, default 8081) publicly over HTTPS via Tailscale Funnel
sudo tailscale funnel --bg 8081
```

This gives you a public `https://<machine-name>.<your-tailnet>.ts.net` URL that proxies straight to `nginx-dev` → `nucleus-dev`. Set that as `DEV_NEURALOPS_SERVER_URL` in `.env`, then restart both `nucleus-dev` and `realtime-dev` — Centrifugo's allowed-origins check also reads this value — so `GET /api/v1/auth/config/` reports it correctly:

```bash
docker compose restart nucleus-dev realtime-dev
```

Then:

1. Open the frontend (e.g. wherever your `neuralops-nexus-demo...` deployment lives).
2. Sign in with your Supabase account.
3. Use the "add server" / connect flow and paste your Tailscale Funnel URL.
4. The frontend calls `GET /api/v1/auth/verify/` against that URL to confirm access.

`tailscale funnel status` shows the active funnel; `tailscale funnel --bg 8081 off` (or `tailscale funnel reset`) tears it down.

### Option B — Fully local, no Tailscale (run backend + frontend together)

`react-app-dev` is already part of the `dev` profile — it comes up automatically with `docker compose up -d`, no separate command needed. If you only want to rebuild it after a dependency change:

```bash
docker compose up -d --build react-app-dev
```

Set `DEV_NEURALOPS_SERVER_URL=http://localhost:8081` (or your machine's LAN IP if you want other devices on your network to reach it, e.g. `http://192.168.1.90:8081`) in `.env`, then:

```bash
docker compose restart nucleus-dev realtime-dev
```

Open `http://<host>:3003` (or whatever `DEV_REACT_HOST_PORT` is set to) directly in the browser. Nothing leaves your machine/network — no Tailscale, no public exposure. Both the frontend port (3003 by default) and the API port (8081 by default) need to be reachable from wherever your browser actually is.

To remap any host-side port, change the matching `DEV_*_HOST_PORT` variable in `.env` (e.g. `DEV_NGINX_HOST_PORT`, `DEV_REACT_HOST_PORT`) rather than editing `docker-compose.yaml` directly.

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
