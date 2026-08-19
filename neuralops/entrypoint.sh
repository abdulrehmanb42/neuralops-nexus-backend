#!/usr/bin/env bash
# neuralops/entrypoint.sh
#
# One image, three processes. The first argument picks which venv/working
# directory to run in; everything after it is exec'd directly. See
# docker-compose.neuralops.yaml for the exact command: each service uses.
#
#   entrypoint.sh nucleus-env   uvicorn core.asgi:application --host 0.0.0.0 --port 8000
#   entrypoint.sh nucleus-env   celery -A core worker -l info
#   entrypoint.sh nucleus-env   celery -A core beat -l info
#   entrypoint.sh nexus-ai-env  python3 -m uvicorn apps.main:app --host 0.0.0.0 --port 8000
#   entrypoint.sh centrifugo    nexus-transport --admin.enabled --admin.insecure --client.insecure --http_api.insecure
#   entrypoint.sh init-secrets  (no further args -- prints KEY=VALUE lines, run once per deployment)
set -e

MODE="$1"
shift || true

case "$MODE" in
  nucleus-env)
    export VIRTUAL_ENV=/opt/venv/nucleus-env
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    export PYTHONPATH=/nexus/nucleus
    cd /nexus/nucleus
    ;;
  nexus-ai-env)
    export VIRTUAL_ENV=/opt/venv/nexus-ai-env
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    export PYTHONPATH=/nexus/ai
    cd /nexus/ai
    ;;
  centrifugo)
    # nexus-transport is a static binary already on PATH — no venv needed.
    # It reads CENTRIFUGO_HTTP_API_KEY specifically (Centrifugo's own env
    # var name), not CENTRIFUGO_API_KEY (nucleus's/nexus-ai's name for the
    # same value, now supplied per-deployment via neuralops/secrets.env --
    # see docker-compose.neuralops.yaml). Exporting it here under both
    # names avoids having to reference the secret under two different
    # names in compose.
    export CENTRIFUGO_HTTP_API_KEY="$CENTRIFUGO_API_KEY"
    ;;
  init-secrets)
    # One-shot generator, NOT a long-running service -- run once per
    # deployment:
    #   docker run --rm <image> init-secrets > neuralops/secrets.env
    # Prints a fresh, unique FIELD_ENCRYPTION_KEY/INTERNAL_API_KEY/
    # CENTRIFUGO_API_KEY/CENTRIFUGO_HMAC_SECRET as KEY=VALUE lines to
    # stdout. These are the internal-only secrets that used to be baked
    # as one shared default for every deployment (see git history on
    # neuralops/Dockerfile) -- moved here once the image went public on
    # Docker Hub, since a shared baked value stopped being a secret the
    # moment anyone could `docker pull` and read it out of the image.
    # SUPABASE_URL/SUPABASE_ANON_KEY are NOT generated here -- those point
    # at one real shared Supabase project and are meant to be identical
    # across every deployment, not per-install secrets.
    # Uses nucleus-env's python (has `cryptography` for a real Fernet key,
    # required by intelligence.py's _fernet()) -- doesn't touch the DB or
    # need the app running, this is pure value generation.
    export VIRTUAL_ENV=/opt/venv/nucleus-env
    export PATH="$VIRTUAL_ENV/bin:$PATH"
    exec python3 -c "
import secrets
from cryptography.fernet import Fernet
print(f'FIELD_ENCRYPTION_KEY={Fernet.generate_key().decode()}')
print(f'INTERNAL_API_KEY={secrets.token_urlsafe(32)}')
print(f'CENTRIFUGO_API_KEY={secrets.token_urlsafe(32)}')
print(f'CENTRIFUGO_HMAC_SECRET={secrets.token_urlsafe(32)}')
"
    ;;
  *)
    echo "entrypoint.sh: unknown mode '$MODE' (expected nucleus-env | nexus-ai-env | centrifugo | init-secrets)" >&2
    exit 1
    ;;
esac

exec "$@"
