"""
OAuth2 authorization-code flow for MCPServer.auth_type = OAUTH2.

Uses Authlib's plain httpx-based OAuth2Client (not the Django integration --
this backend is stateless/bearer-auth throughout, no Django session reliance
anywhere else, so state rides on django.core.signing instead of the session).
"""
from datetime import timedelta

from authlib.integrations.httpx_client import OAuth2Client
from django.conf import settings
from django.core import signing
from django.utils import timezone

_SIGNING_SALT = "mcp-oauth-state"
_STATE_MAX_AGE = 600  # 10 min to complete the provider's consent screen


def _redirect_uri() -> str:
    base = getattr(settings, "NEURALOPS_SERVER_URL", "").rstrip("/")
    # intelligence_router is mounted at "/" (see core/urls.py:
    # api.add_router("/", intelligence_router)), not "/intelligence/" --
    # the actual path is /api/v1/mcp-servers/oauth/callback/. This must
    # match exactly what's sent to the provider's authorize endpoint AND
    # what's sent again on token exchange, or the provider rejects the
    # code exchange with a redirect_uri mismatch.
    return f"{base}/api/v1/mcp-servers/oauth/callback/"


def build_authorize_url(server, frontend_origin: str) -> str:
    """
    frontend_origin: window.location.origin of the tab that asked for this --
    signed into state so the callback knows which origin's postMessage() to
    use (self-hosted deployments don't have one fixed frontend URL).
    """
    cfg = server.oauth_config or {}
    state = signing.dumps(
        {"server_id": str(server.id), "frontend_origin": frontend_origin},
        salt=_SIGNING_SALT,
    )
    client = OAuth2Client(
        client_id=cfg["client_id"],
        scope=" ".join(cfg.get("scopes", [])),
        redirect_uri=_redirect_uri(),
    )
    # Extra provider-specific authorize params (Atlassian needs audience +
    # prompt=consent, Google needs access_type=offline + prompt=consent) so
    # the provider actually returns a refresh_token. Generic -- any auth-code
    # provider works by supplying its own endpoints/scopes/params.
    extra = {str(k): str(v) for k, v in (cfg.get("authorize_params") or {}).items()}
    url, _ = client.create_authorization_url(cfg["authorize_endpoint"], state=state, **extra)
    return url


def complete_callback(code: str, state: str) -> dict:
    """Exchange code→tokens, store them. Returns {"server_id", "frontend_origin"}."""
    from nucleus.models import MCPServer

    data = signing.loads(state, salt=_SIGNING_SALT, max_age=_STATE_MAX_AGE)
    server = MCPServer.objects.filter(
        id=data["server_id"], auth_type=MCPServer.AuthType.OAUTH2, is_active=True,
    ).first()
    if not server:
        raise ValueError("MCP server not found or no longer OAuth2.")

    cfg = server.oauth_config or {}
    secrets = server.get_secrets()
    client = OAuth2Client(
        client_id=cfg["client_id"],
        client_secret=secrets.get("client_secret"),
        redirect_uri=_redirect_uri(),
        headers={"Accept": "application/json"},
    )
    token = client.fetch_token(cfg["token_endpoint"], code=code)
    _store_token(server, token)
    return {"server_id": data["server_id"], "frontend_origin": data["frontend_origin"]}


def refresh_if_needed(server) -> bool:
    """
    Called from internal/api.py right before a server's secrets go to
    nexus-ai. Returns True if the server has (or now has, after a silent
    refresh) a valid token. Returns False if it genuinely needs the user
    to reconnect. No-op / True for non-OAuth2 servers.
    """
    from nucleus.models import MCPServer

    if server.auth_type != MCPServer.AuthType.OAUTH2:
        return True

    cfg = server.oauth_config or {}
    secrets = server.get_secrets()
    refresh_token = secrets.get("refresh_token")
    if not refresh_token:
        return False  # never connected

    expires_at = cfg.get("expires_at")
    if expires_at and timezone.datetime.fromisoformat(expires_at) > timezone.now() + timedelta(seconds=60):
        return True  # still valid, nothing to do
    client = OAuth2Client(
        client_id=cfg["client_id"],
        client_secret=secrets.get("client_secret"),
        headers={"Accept": "application/json"},
    )
    try:
        token = client.refresh_token(cfg["token_endpoint"], refresh_token=refresh_token)
    except Exception:
        return False  # revoked/expired refresh_token -- needs a real re-auth

    _store_token(server, token)
    return True


def _store_token(server, token: dict) -> None:
    cfg = server.oauth_config or {}
    token_env_var = cfg.get("token_env_var", "OAUTH_ACCESS_TOKEN")

    secrets = server.get_secrets()
    secrets[token_env_var] = token["access_token"]
    if token.get("refresh_token"):  # some providers omit this on refresh
        secrets["refresh_token"] = token["refresh_token"]
    server.set_secrets(secrets)

    if token.get("expires_in"):
        cfg["expires_at"] = (timezone.now() + timedelta(seconds=int(token["expires_in"]))).isoformat()
        server.oauth_config = cfg

    server.save()