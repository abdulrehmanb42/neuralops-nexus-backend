# Self-Hosting NeuralOps — Setup Guide

This runs your own private NeuralOps server in a single Docker container. It
includes everything — the backend, the AI engine, real-time chat, the
database, and caching. You connect the official NeuralOps web app to your
server afterward; there's no separate frontend to install.

Estimated time: 10–15 minutes.

---

## What you need first

- A computer or server with **Docker** installed and running.
- That machine reachable from the internet (or at least from wherever you'll
  use NeuralOps from) on **one port**. Any of the following works:
  - A domain name pointed at the machine, with a reverse proxy / TLS in front.
  - [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) — the simplest
    option if you already use Tailscale.
  - A cloud provider's load balancer / public IP.

You'll end up with one URL, e.g. `https://neuralops.example.com`. Keep it
handy — you'll need it in step 2.

---

## Step 1 — Pull the image

```bash
docker pull noamanfaisal/neuralops-fat:latest
```

---

## Step 2 — Run the container

```bash
docker run -d --name neuralops -p 8080:8080 \
  -e NEURALOPS_SERVER_URL=https://neuralops.example.com \
  -v neuralops-postgres-data:/var/lib/postgresql/data \
  -v neuralops-secrets:/nexus/secrets \
  -v neuralops-logs:/nexus/logs \
  -v neuralops-projects:/nexus/projects \
  noamanfaisal/neuralops-fat:latest
```

Replace `https://neuralops.example.com` with your own public URL from the
prerequisites above, and point whatever's serving that URL (reverse proxy,
Tailscale Funnel, load balancer) at port `8080` on this machine.

The named volumes (`neuralops-postgres-data`, etc.) keep your data safe across
restarts and upgrades — don't delete them unless you intend to wipe everything.

---

## Step 3 — Set up your database and credentials

```bash
docker exec neuralops python3 /nexus/bootstrap.py generate-env
docker exec neuralops python3 /nexus/bootstrap.py init-db
```

This generates a unique database and set of secrets for your server (nothing
shared with anyone else's install) and gets the database ready. Safe to run
more than once — it won't overwrite anything already set up.

---

## Step 4 — Apply database migrations

```bash
docker exec -u nexus neuralops bash -c '
  cd /nexus/nucleus
  set -a; . /nexus/secrets/app.env; set +a
  python3 manage.py migrate
'
```

---

## Step 5 — Start the server

Run each of these once. They start the backend, AI engine, real-time chat,
caching, and background task processing.

```bash
# Cache / background task queue
docker exec -u redis -d neuralops bash -c '
  redis-server --bind 127.0.0.1 --port 6379 --logfile /nexus/logs/redis/redis.log
'

# Backend
docker exec -u nexus -d neuralops bash -c '
  cd /nexus/nucleus
  set -a; . /nexus/secrets/app.env; set +a
  export LOG_DIR=/nexus/logs/nucleus
  uvicorn core.asgi:application --host 0.0.0.0 --port 8000 --workers 2 > /nexus/logs/nucleus/stdout.log 2>&1
'

# AI engine
docker exec -u nexus -d neuralops bash -c '
  cd /nexus/ai
  set -a; . /nexus/secrets/app.env; set +a
  export LOG_DIR=/nexus/logs/ai
  export PYTHONPATH=/nexus/ai
  python3 -m uvicorn apps.main:app --host 0.0.0.0 --port 8002 > /nexus/logs/ai/stdout.log 2>&1
'

# Real-time chat
docker exec -u nexus -d neuralops bash -c '
  set -a; . /nexus/secrets/app.env; set +a
  nexus-transport --admin.enabled --admin.insecure --client.insecure --http_api.insecure --http_server.port=8001 > /nexus/logs/transport.log 2>&1
'

# Background tasks
docker exec -u nexus -d neuralops bash -c '
  cd /nexus/nucleus
  set -a; . /nexus/secrets/app.env; set +a
  export LOG_DIR=/nexus/logs/nucleus
  celery -A core worker -l info > /nexus/logs/nucleus/celery-worker.log 2>&1
'

# Scheduled tasks
docker exec -u nexus -d neuralops bash -c '
  cd /nexus/nucleus
  set -a; . /nexus/secrets/app.env; set +a
  export LOG_DIR=/nexus/logs/nucleus
  celery -A core beat -l info > /nexus/logs/nucleus/celery-beat.log 2>&1
'
```

---

## Step 6 — Create your owner account

You'll need a NeuralOps account (sign up in the official web app first if you
haven't already) — this step links that account to your new server as its
owner.

```bash
docker exec -u nexus -it neuralops bash -c '
  cd /nexus/nucleus
  set -a; . /nexus/secrets/app.env; set +a
  python3 manage.py create_owner
'
```

Enter the email and password of your NeuralOps account when prompted.

---

## Step 7 — Connect

Open the NeuralOps web app, choose "Connect to your own server," and enter
your server's URL from step 2. Sign in with the account you just made the
owner of.

---

## Checking everything's running

```bash
docker exec neuralops ps aux
```

You should see six processes: nginx, uvicorn (backend), uvicorn (AI engine),
nexus-transport, and two celery processes.

---

## Upgrading to a new version

```bash
docker pull noamanfaisal/neuralops-fat:latest
docker stop neuralops
docker rm neuralops
```

Then repeat Step 2 onward with the same volume names — your data and
credentials carry over automatically. `generate-env` and `init-db` in Step 3
are safe to re-run; they won't touch anything already set up.

---

## Troubleshooting

**Can't sign in / "Update required" message** — make sure the URL you
connected to in Step 7 exactly matches `NEURALOPS_SERVER_URL` from Step 2.

**Avatar or media images not loading** — double check `NEURALOPS_SERVER_URL`
was set correctly in Step 2; this is what the server uses to build image
links.

**A process isn't running** — check its log under the `neuralops-logs`
volume, e.g.:

```bash
docker exec neuralops cat /nexus/logs/nucleus/stdout.log
```
