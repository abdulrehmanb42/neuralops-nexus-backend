# DeviceSession (device-activation polling) was removed — see
# migrations/0003_delete_devicesession.py. The frontend never used the
# /auth/init/ + /auth/status/ flow; it signs in via Supabase directly.

# ── Permission system bridge ─────────────────────────────────────────────────
# The actual Role / Right / RoleRight / RoleAssignment model classes live in
# authn/permissions/models.py (kept together with the rest of the permission
# system code, see authn/permissions/__init__.py). Django's migration
# autodetector only scans the `authn.models` module for this app, so they're
# re-exported here — this import is the only thing tying them to this file.
from authn.permissions.models import (  # noqa: E402,F401
    ScopeType, ObjectType, Right, Role, RoleRight, RoleAssignment,
)
