#!/usr/bin/env bash
# NeuralOps self-host installer (#170 — fat profile). See SELF-HOST.md and
# DECISIONS.md §20 for the full design story.
#
# Usage:
#   ./install.sh            first-time setup (download, secrets, bring the stack up)
#   ./install.sh update     pull the latest version and restart
#
# Deliberately stops after the stack is up — migrate/seed_permissions/
# create_owner/Tailscale are separate, visible commands printed at the end
# instead of being hidden inside this script. That's on purpose: a scripted
# wait-loop around Postgres readiness silently masked a real bug earlier
# (pg_isready defaulting to the wrong database name) and made it impossible
# to tell "still starting" from "actually broken". Running each step by hand
# means you see exactly what's happening and where it stops, if it stops.
#
# What this does NOT do: touch your existing "dev" stack, require any
# Tailscale auth key/secret, or need any source tree — everything it pulls
# is a pre-built image from Docker Hub.

set -euo pipefail

# ── Config — adjust REPO_RAW_BASE/REF once a real release tag exists ────────
REPO_RAW_BASE="https://raw.githubusercontent.com/mapax-io/neuralops-nexus"
REF="${NEURALOPS_REF:-dev}"   # TODO: point at a real git tag (e.g. v0.1.0) once one is cut
INSTALL_DIR="${NEURALOPS_INSTALL_DIR:-$(pwd)}"   # installs into the CURRENT directory, no nested subfolder
VERSION_MARKER="$INSTALL_DIR/.neuralops-version"

divider() { printf '%s\n' "────────────────────────────────────────────────────────"; }

# ── 0. Update mode ───────────────────────────────────────────────────────────
if [ "${1:-}" = "update" ]; then
  cd "$INSTALL_DIR" || { echo "No existing install found at $INSTALL_DIR"; exit 1; }
  local_version=$(cat "$VERSION_MARKER" 2>/dev/null || echo "none")
  latest_version=$(curl -fsSL "$REPO_RAW_BASE/$REF/VERSION" 2>/dev/null || echo "$local_version")
  if [ "$local_version" = "$latest_version" ]; then
    echo "Already on the latest version ($local_version)."
    exit 0
  fi
  echo "Updating $local_version -> $latest_version"
  curl -fsSL "$REPO_RAW_BASE/$REF/docker-compose.yaml" -o docker-compose.yaml
  echo "$latest_version" > "$VERSION_MARKER"
  # Image tags come from .env's FAT_VERSION, not the VERSION marker above --
  # without this, docker-compose.yaml gets updated but `docker compose pull`
  # keeps pulling the OLD image tag forever, silently. Found while bumping
  # 0.1.0 -> 0.1.1 for the version-check feature itself (#170).
  if [ -f .env ] && grep -q '^FAT_VERSION=' .env; then
    sed -i.bak "s/^FAT_VERSION=.*/FAT_VERSION=$latest_version/" .env && rm -f .env.bak
  fi
  docker compose pull
  docker compose up -d
  echo "Updated. Run 'docker compose logs -f nucleus-fat' to confirm it's healthy."
  exit 0
fi

# ── 1. Docker check ───────────────────────────────────────────────────────────
divider
echo "  NeuralOps — Self-Host Installer (fat profile)"
divider

if ! command -v docker >/dev/null 2>&1; then
  echo
  read -rp "  Docker isn't installed. Install it now? (yes/no): " install_docker < /dev/tty
  if [ "$install_docker" = "yes" ] || [ "$install_docker" = "y" ]; then
    curl -fsSL https://get.docker.com | sh
  else
    echo "  Docker is required. Install it and re-run this script."
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "  ✗ 'docker compose' (v2 plugin) not found. Install it and re-run."
  exit 1
fi

# ── 2. Fetch the pinned compose file ─────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo
echo "  Downloading docker-compose.yaml ($REF)..."
curl -fsSL "$REPO_RAW_BASE/$REF/docker-compose.yaml" -o docker-compose.yaml

latest_version=$(curl -fsSL "$REPO_RAW_BASE/$REF/VERSION" 2>/dev/null || echo "0.1.0")
echo "$latest_version" > "$VERSION_MARKER"

# ── 3. Secrets — auto-generate what can be, leave the rest blank ────────────
gen_hex()   { python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32; }
gen_fernet(){ python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())" 2>/dev/null || openssl rand -base64 32; }

echo
echo "  Generating internal secrets..."
FIELD_ENCRYPTION_KEY=$(gen_fernet)
INTERNAL_API_KEY=$(gen_hex)
CENTRIFUGO_API_KEY=$(gen_hex)
CENTRIFUGO_HMAC_SECRET=$(gen_hex)
INSTALL_TOKEN=$(gen_hex)
POSTGRES_PASSWORD=$(gen_hex)

# AI provider key(s) and the Supabase service key are left blank on purpose —
# add them to .env whenever you're ready (see the summary at the end).

# ── 4. Write .env ─────────────────────────────────────────────────────────────
cat > .env <<EOF
COMPOSE_PROFILES=fat
FAT_VERSION=$latest_version

FAT_POSTGRES_USER=neuralops
FAT_POSTGRES_PASSWORD=$POSTGRES_PASSWORD
FAT_POSTGRES_DB=neuralops_fat
FAT_POSTGRES_URL=postgresql+asyncpg://neuralops:$POSTGRES_PASSWORD@postgres-fat:5432/neuralops_fat

FAT_FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY
FAT_INTERNAL_API_KEY=$INTERNAL_API_KEY
FAT_CENTRIFUGO_API_KEY=$CENTRIFUGO_API_KEY
FAT_CENTRIFUGO_HMAC_SECRET=$CENTRIFUGO_HMAC_SECRET

FAT_SUPABASE_URL=https://xgfsxikypxjhqlutiepw.supabase.co
FAT_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZnN4aWt5cHhqaHFsdXRpZXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDg3MDcsImV4cCI6MjA5NzgyNDcwN30.2_OUNTHuKSeDJh6S-aUW16IqvDTmew8ZcFuKvFkt3Dk
FAT_SUPABASE_SERVICE_KEY=

FAT_OPENAI_API_KEY=
FAT_ANTHROPIC_API_KEY=

FAT_NEURALOPS_INSTALL_TOKEN=$INSTALL_TOKEN
FAT_NEURALOPS_SERVER_URL=http://localhost:8090
EOF

echo "  ✓ .env written"

# ── 5. Bring the stack up ────────────────────────────────────────────────────
echo
echo "  Pulling images and starting the stack..."
docker compose pull
docker compose up -d

# ── 6. Done — hand off the remaining steps as explicit, visible commands ────
divider
echo "  ✓ Stack is up. Installed in: $INSTALL_DIR"
echo
echo "  Next steps — run these yourself, one at a time, so you can see exactly"
echo "  what's happening at each step:"
echo
echo "  1) Confirm Postgres is actually ready (don't skip — check the output):"
echo "       docker compose logs --tail=20 postgres-fat"
echo "     Look for \"database system is ready to accept connections\"."
echo
echo "  2) Create the schema:"
echo "       docker compose exec nucleus-fat python manage.py migrate"
echo
echo "  3) Seed the permission registry:"
echo "       docker compose exec nucleus-fat python manage.py seed_permissions"
echo
echo "  4) Create the server owner (interactive — needs a NeuralOps/Supabase account):"
echo "       docker compose exec nucleus-fat python manage.py create_owner"
echo
echo "  5) (Optional) Expose this server via Tailscale Funnel — no auth key"
echo "     needed, just one login click if you're not already signed in:"
echo "       curl -fsSL https://tailscale.com/install.sh | sh   # if not already installed"
echo "       sudo tailscale up                                  # skip if already logged in"
echo "       sudo tailscale funnel --bg 8090"
echo "     Then set FAT_NEURALOPS_SERVER_URL in .env to the printed"
echo "     https://...ts.net URL and run:"
echo "       docker compose restart nucleus-fat realtime-fat"
echo
echo "  6) Before adding an AI model, edit .env and set FAT_OPENAI_API_KEY"
echo "     and/or FAT_ANTHROPIC_API_KEY, and FAT_SUPABASE_SERVICE_KEY, then:"
echo "       docker compose restart nucleus-fat nexus-ai-fat"
echo
echo "  There is no local frontend in this bundle — sign in at the hosted"
echo "  NeuralOps app and connect it to your server URL (FAT_NEURALOPS_SERVER_URL"
echo "  in .env, default http://localhost:8090 for local-only access)."
echo
echo "  Run './install.sh update' any time to pull the latest version."
divider
