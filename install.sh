#!/usr/bin/env bash
# NeuralOps self-host installer (#170 — fat profile). See SELF-HOST.md and
# DECISIONS.md §20 for the full design story.
#
# Usage:
#   ./install.sh            first-time install
#   ./install.sh update     pull the latest version and restart
#   ./install.sh --no-tailscale   skip Tailscale exposure entirely
#
# What this does NOT do: touch your existing "dev" stack, require any
# Tailscale auth key/secret (a single browser login click is the only
# manual step), or need any source tree — everything it pulls is a
# pre-built image from Docker Hub.

set -euo pipefail

# ── Config — adjust REPO_RAW_BASE/REF once a real release tag exists ────────
REPO_RAW_BASE="https://raw.githubusercontent.com/noamanfaisal/neuralops-nexus-backend"
REF="${NEURALOPS_REF:-staging}"   # TODO: point at a real git tag (e.g. v0.1.0) once one is cut
INSTALL_DIR="${NEURALOPS_INSTALL_DIR:-$(pwd)/neuralops}"
VERSION_MARKER="$INSTALL_DIR/.neuralops-version"
NO_TAILSCALE=0

for arg in "$@"; do
  case "$arg" in
    --no-tailscale) NO_TAILSCALE=1 ;;
  esac
done

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

# ── 3. Secrets — auto-generate what can be, prompt for the rest ─────────────
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

echo
echo "  AI provider key(s) and the Supabase service key are left blank on"
echo "  purpose -- add them to .env whenever you're ready (see the summary"
echo "  printed at the end of this script)."
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
SUPABASE_SERVICE_KEY=""

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
FAT_SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

FAT_OPENAI_API_KEY=$OPENAI_API_KEY
FAT_ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

FAT_NEURALOPS_INSTALL_TOKEN=$INSTALL_TOKEN
FAT_NEURALOPS_SERVER_URL=http://localhost:8090
EOF

echo "  ✓ .env written"

# ── 5. Bring the stack up ────────────────────────────────────────────────────
echo
echo "  Pulling images and starting the stack..."
docker compose pull
docker compose up -d

echo "  Waiting for Postgres..."
until docker compose exec -T postgres-fat pg_isready -U neuralops >/dev/null 2>&1; do
  sleep 2
done

# ── 6. First-run sequence ────────────────────────────────────────────────────
echo
echo "  Running first-time setup (migrate, permissions)..."
docker compose exec -T nucleus-fat python manage.py migrate
docker compose exec -T nucleus-fat python manage.py seed_permissions

echo
echo "  Now let's create the server owner (needs a NeuralOps/Supabase account):"
docker compose exec nucleus-fat python manage.py create_owner < /dev/tty

# ── 7. Tailscale (optional, no auth key required) ───────────────────────────
if [ "$NO_TAILSCALE" -eq 0 ]; then
  echo
  read -rp "  Expose this server via Tailscale Funnel? (Y/n): " use_tailscale < /dev/tty
  if [ "$use_tailscale" != "n" ] && [ "$use_tailscale" != "no" ]; then
    if ! command -v tailscale >/dev/null 2>&1; then
      echo "  Installing Tailscale..."
      curl -fsSL https://tailscale.com/install.sh | sh
    fi

    if ! sudo tailscale status >/dev/null 2>&1; then
      echo "  Log in to Tailscale — a URL will appear below, open it in a browser:"
      sudo tailscale up
    fi

    NGINX_PORT=$(grep '^FAT_NGINX_HOST_PORT=' .env | cut -d= -f2)
    NGINX_PORT="${NGINX_PORT:-8090}"
    sudo tailscale funnel --bg "$NGINX_PORT"

    FUNNEL_URL=$(tailscale funnel status 2>/dev/null | grep -o 'https://[^ ]*' | head -1)
    if [ -n "$FUNNEL_URL" ]; then
      sed -i.bak "s#^FAT_NEURALOPS_SERVER_URL=.*#FAT_NEURALOPS_SERVER_URL=$FUNNEL_URL#" .env
      docker compose restart nucleus-fat realtime-fat
      echo "  ✓ Exposed at $FUNNEL_URL"
    else
      echo "  ⚠ Could not detect the Funnel URL automatically — run"
      echo "    'tailscale funnel status' and set FAT_NEURALOPS_SERVER_URL in"
      echo "    .env by hand, then 'docker compose restart nucleus-fat realtime-fat'."
    fi
  fi
fi

# ── 8. Done ───────────────────────────────────────────────────────────────────
divider
SERVER_URL=$(grep '^FAT_NEURALOPS_SERVER_URL=' .env | cut -d= -f2)
echo "  ✓ NeuralOps is running."
echo
echo "  Server URL: $SERVER_URL"
echo "  There is no local frontend in this bundle — sign in at the hosted"
echo "  NeuralOps app and connect it to the server URL above."
echo
echo "  Before adding an AI model, edit .env in this folder and set"
echo "  FAT_OPENAI_API_KEY and/or FAT_ANTHROPIC_API_KEY, and"
echo "  FAT_SUPABASE_SERVICE_KEY, then run:"
echo "    docker compose restart nucleus-fat nexus-ai-fat"
echo
echo "  Run './install.sh update' any time to pull the latest version."
divider
