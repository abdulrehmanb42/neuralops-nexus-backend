# Self-Hosting NeuralOps (unified image)

This is the fast path: **one pre-built Docker image**
(`noamanfaisal/neuralops`), no source code, no local builds. If you want the
full developer setup instead (hot-reload, local frontend, editable source),
see `readme.md` and use the `dev` profile of the original
`docker-compose.yaml` — that file is untouched by this guide.

There is **no local frontend** in this bundle. You sign in at the hosted
NeuralOps app and connect it to your self-hosted server's URL — see step 6.

This supersedes the older "fat" distribution (`docker-compose.yaml`'s `fat`
profile, three separate `neuralops-nucleus`/`neuralops-nexus-ai`/
`neuralops-nginx` images, `install.sh`). Same idea — pre-built images, no
source tree — but one shared image (`neuralops/Dockerfile`) now backs
`nucleus`, `nexus-ai`, and `centrifugo`, each still its own container,
selected via `entrypoint.sh`'s first argument. See the comment block at the
top of `docker-compose.neuralops.yaml` and `DECISIONS.md` §20 for the fuller
history (§20 documents the *fat* profile specifically; this file documents
what replaced it).

## Requirements

- Docker with the Compose v2 plugin.
- ~4GB RAM minimum. Can drop closer to 2GB if you use an API-based embedding
  provider instead of the default local `fastembed` model, which gets loaded
  fully into memory.
- An existing NeuralOps account (sign up at the hosted app first) — needed
  for `create_owner` in step 5.

## Step 1 — Get the compose file and env templates

```bash
mkdir neuralops-selfhost && cd neuralops-selfhost
curl -fsSL https://raw.githubusercontent.com/mapax-io/neuralops-nexus/dev/docker-compose.neuralops.yaml -o docker-compose.neuralops.yaml
mkdir -p neuralops
curl -fsSL https://raw.githubusercontent.com/mapax-io/neuralops-nexus/dev/neuralops/infra.env.example -o neuralops/infra.env
curl -fsSL https://raw.githubusercontent.com/mapax-io/neuralops-nexus/dev/neuralops/app.env.example -o neuralops/app.env
```

> Both `neuralops/infra.env` and `neuralops/app.env` are gitignored templates
> you fill in locally — never commit real values. (As with the old fat
> profile, these raw URLs depend on the fork→`mapax-io/neuralops-nexus` PR
> having landed — see `DECISIONS.md` §20's "Distribution address" note. If it
> hasn't yet, fetch from the fork instead.)

## Step 2 — Generate your deployment's secrets

Four internal secrets (`FIELD_ENCRYPTION_KEY`, `INTERNAL_API_KEY`,
`CENTRIFUGO_API_KEY`, `CENTRIFUGO_HMAC_SECRET`) are generated fresh per
install — nothing shared with anyone else's deployment, and nothing baked
into the public image:

```bash
docker run --rm noamanfaisal/neuralops:0.1.1 init-secrets > neuralops/secrets.env
```

Safe to run again if you ever lose the file, but note: rotating these after
first run invalidates existing sessions and re-encrypts nothing automatically
(existing AI-model keys encrypted under the old `FIELD_ENCRYPTION_KEY` won't
decrypt) — treat `neuralops/secrets.env` as something to generate once and
keep, not regenerate casually.

## Step 3 — Fill in the two env files

`neuralops/infra.env` — the external plumbing:

| Variable | Purpose |
|---|---|
| `COMPOSE_PROJECT_NAME` | Already set to `neuralops` — **do not remove this line.** Without it, Compose scopes containers by directory name and can collide with an existing `docker-compose.yaml` dev/fat stack in the same folder (see the comment in `infra.env.example`). |
| `COMPOSE_PROFILES` | Already set to `production` — pulls prebuilt images, no build step. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Set a real password; the other two have working defaults. |
| `NGINX_HOST_PORT` / `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` / `NEXUS_AI_HOST_PORT` | Optional — defaults (8095/5495/6395/8020) are fine unless something else on the box already uses them. |

`neuralops/app.env` — the one thing that's genuinely different per
deployment:

| Variable | Purpose |
|---|---|
| `NEURALOPS_SERVER_URL` | The URL *other people* will reach this server at, e.g. `https://neuralops.example.com` — not `localhost` unless you're the only user. Defaults to `http://localhost:8095`. |

Everything else (Supabase URL/anon key, portal URL, version) is baked into
the image itself and isn't settable from these files — see the comment block
in `neuralops/app.env.example` if you're curious why. There's also no AI
provider key here on purpose — you add that from inside the chat after
connecting (step 7), not as an env var.

## Step 4 — Bring the stack up

```bash
docker compose -f docker-compose.neuralops.yaml \
  --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env \
  up -d
```

`docker compose ... ps` should show 9 containers up: `nucleus`,
`nucleus-celery`, `nucleus-celery-beat`, `nexus-ai`, `centrifugo`, `postgres`,
`redis`, `chromadb`, `nginx`.

> Always pass all three `--env-file` flags together on every command below —
> Compose doesn't auto-load `neuralops/*.env`, and this repo's existing plain
> `.env` belongs to the *old* `docker-compose.yaml` (different profile names,
> would collide if picked up by accident).

## Step 5 — First-run setup

Run these once, in order, against a fresh database. Because the app code in
this image only has its Python venv on `PATH` inside `entrypoint.sh`'s own
dispatch (not baked into the image's default `PATH`), one-off commands go
*through* `entrypoint.sh` explicitly — pass `nucleus-env` as the first
argument, same as the service's own `command:` does in
`docker-compose.neuralops.yaml`:

```bash
docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env \
  exec nucleus entrypoint.sh nucleus-env python manage.py migrate

docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env \
  exec nucleus entrypoint.sh nucleus-env python manage.py seed_permissions

docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env \
  exec -it nucleus entrypoint.sh nucleus-env python manage.py create_owner
```

- `migrate` creates the schema.
- `seed_permissions` seeds the RBAC right codes — skip it and every
  permission check 500s with `Unknown right code`.
- `create_owner` is interactive — needs a **Supabase account already created
  at the NeuralOps sign-up page**; sign up first if you don't have one, then
  re-run. (Order between `seed_permissions`/`create_owner` beyond `migrate`
  going first doesn't matter — both converge on the same Owner role row.)

> **Not yet verified end-to-end against this exact image** (unlike the
> `fat` profile, which `TASKS.md` #170 / `DECISIONS.md` §20 confirm was
> tested live) — this `exec ... entrypoint.sh nucleus-env ...` invocation is
> the correct shape based on reading `entrypoint.sh`/`neuralops/Dockerfile`
> directly, but hasn't been run against a live container from this session.
> If `python: command not found` or similar shows up, confirm with
> `docker compose ... exec nucleus which python` first.

## Step 6 — Expose your server

Same two options as the old fat profile — pick one:

**Tailscale Funnel** (simplest, no router config):

```bash
curl -fsSL https://tailscale.com/install.sh | sh   # skip if already installed
sudo tailscale up                                    # skip if already logged in
sudo tailscale funnel --bg 8095                       # or your NGINX_HOST_PORT
```

Then set `NEURALOPS_SERVER_URL` in `neuralops/app.env` to the printed
`https://...ts.net` URL and restart the two services that read it
(nucleus builds the value into API responses; centrifugo checks it for
allowed WebSocket origins):

```bash
docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env \
  restart nucleus centrifugo
```

**Your own domain / reverse proxy / cloud load balancer** — point it at
`NGINX_HOST_PORT` on this machine, set `NEURALOPS_SERVER_URL` to match, and
restart the same two services.

## Step 7 — Connect and add a model

1. Open the NeuralOps web app, choose "Connect to your own server," and
   enter your server's URL from step 6. Sign in with the account you just
   made the owner of.
2. In any chat, type `/add-model` and paste an OpenAI or Anthropic API key —
   it's stored encrypted per-row using `FIELD_ENCRYPTION_KEY` from
   `neuralops/secrets.env`, not read from any env var.

## Updating

```bash
docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env pull
docker compose -f docker-compose.neuralops.yaml --env-file neuralops/infra.env --env-file neuralops/app.env --env-file neuralops/secrets.env up -d
```

Data lives in the named `neuralops_*` volumes (Postgres, Redis, Chroma,
fastembed cache, projects) — untouched by pulling a new image. Generate
`neuralops/secrets.env` once, ever, per deployment and keep it — don't
regenerate it as part of a routine update (see the note in step 2).

## Troubleshooting

- **"Unknown right code" 500** — `seed_permissions` hasn't run (step 5).
- **`ImproperlyConfigured` / encryption errors on first request** —
  `neuralops/secrets.env` wasn't generated or wasn't passed as an
  `--env-file`; see step 2.
- **Can't log in / server unreachable from another device** —
  `NEURALOPS_SERVER_URL` in `neuralops/app.env` needs to be the URL *other*
  machines can reach, not `localhost`. Restart `nucleus` and `centrifugo`
  after changing it (step 6).
- **502 from nginx** — check `docker compose ... logs nginx`; usually means
  `nucleus` isn't up yet, or crashed — check `docker compose ... logs nucleus`.
- **Filesystem MCP / tool calls fail with connection refused** — MCP servers
  called from `nexus-ai` need your host's real IP, not `localhost` — same
  rule as the `dev` profile, see `readme.md`'s "Add an MCP server" section.

Full design rationale for the fat-profile predecessor of this stack:
`DECISIONS.md` §20.
