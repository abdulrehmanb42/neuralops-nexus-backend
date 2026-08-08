# Self-Hosting NeuralOps (fat profile)

This is the fast path: pre-built images from Docker Hub, no source code, no
local builds. If you want the full developer setup instead (hot-reload,
local frontend, editable source), see `readme.md` and use the `dev` profile.

There is **no local frontend** in this bundle. You sign in at the hosted
NeuralOps app and connect it to your self-hosted server's URL — see step 3.

## Option A — the installer (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/noamanfaisal/neuralops-nexus-backend/staging/install.sh | bash
```

This single command:

1. Checks for Docker, installs it if missing (with your confirmation).
2. Downloads the pinned `docker-compose.yaml` for the current version.
3. Generates the internal secrets that don't need a human (encryption key,
   API keys between our own services) and asks you for the two or three
   that do (an AI provider key, your Supabase service key).
4. Pulls the images and starts the stack.
5. Runs the one-time setup: database migration, permission seeding, and an
   interactive prompt to create the server owner (you'll need an existing
   NeuralOps/Supabase account for this step — sign up first if you don't
   have one).
6. Offers to expose the server via Tailscale Funnel. No auth key or secret
   needed — it'll print a login URL, you click it once in a browser, and
   everything else (funnel setup, writing the resulting URL into `.env`,
   restarting the affected services) happens automatically. Skip this with
   `./install.sh --no-tailscale` if you'd rather expose it your own way
   (router port-forward, your own reverse proxy, LAN-only).

At the end it prints your server's URL — that's what you connect to from
the hosted frontend.

To update later, from the same directory:

```bash
./install.sh update
```

## Option B — by hand

If you'd rather not pipe a script into bash, or want to see every step:

```bash
mkdir neuralops && cd neuralops
curl -fsSL https://raw.githubusercontent.com/noamanfaisal/neuralops-nexus-backend/staging/docker-compose.yaml -o docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/noamanfaisal/neuralops-nexus-backend/staging/.env.example -o .env
```

Edit `.env`: set `COMPOSE_PROFILES=fat` at the top, and fill in the `FAT_*`
section — required values are Postgres credentials, the four internal
secrets (`FAT_FIELD_ENCRYPTION_KEY` needs a Fernet key specifically, see the
comment above it in `.env`; the rest can be any random string), an AI
provider key, your Supabase service key, and `FAT_NEURALOPS_SERVER_URL` (the
URL other people will actually reach this server at — not `localhost`
unless you're the only one using it).

```bash
docker compose pull
docker compose up -d
docker compose exec nucleus-fat python manage.py migrate
docker compose exec nucleus-fat python manage.py seed_permissions
docker compose exec nucleus-fat python manage.py create_owner
```

(Order between `migrate`/`seed_permissions`/`create_owner` beyond migrate
going first doesn't actually matter — `create_owner` and `seed_permissions`
both converge on the same role row regardless of which runs second.)

Then expose it however you'd like — Tailscale Funnel, your router, your own
reverse proxy — and set `FAT_NEURALOPS_SERVER_URL` in `.env` to match,
restarting `nucleus-fat` and `realtime-fat` after any change to it.

## Requirements

- Docker with the Compose v2 plugin.
- ~4GB RAM minimum. Can drop closer to 2GB if you use an API-based
  embedding provider instead of the default local `fastembed` model, which
  gets loaded fully into memory.
- An existing NeuralOps account (sign up at the hosted app first) to run
  `create_owner`.

## Updating

`./install.sh update` (if you used the installer), or by hand: re-download
`docker-compose.yaml`, `docker compose pull`, `docker compose up -d`. Data
lives in `./data/fat/` on bind-mounted volumes, untouched by image updates.

## Troubleshooting

- **Something 500s with "Unknown right code"** — `seed_permissions` hasn't
  run. Run it: `docker compose exec nucleus-fat python manage.py seed_permissions`.
- **Can't log in / server unreachable from another device** —
  `FAT_NEURALOPS_SERVER_URL` in `.env` needs to be the URL *other* machines
  can reach, not `localhost`. Restart `nucleus-fat` and `realtime-fat` after
  changing it.
- **502 from nginx** — check `docker compose logs nginx-fat`; usually means
  `nucleus-fat` isn't up yet, or crashed — check `docker compose logs nucleus-fat`.

Full design rationale: `DECISIONS.md` §20.
