"""
authn/versions.py

Per-module version numbers -- separate from settings.NEURALOPS_VERSION,
which is the one field the frontend's compareServerVersion() actually
parses (must stay clean MAJOR.MINOR.PATCH semver, see
neuralops-react-app/src/lib/version.ts). These are purely informational,
surfaced via /auth/config/ and /auth/verify/ so the frontend CAN display
them, but never used in the compatibility check itself.

Deliberately NOT cached in settings.py (settings only load once at
process start) -- read straight off each module's own VERSION file on
every call, so these stay current even if a VERSION file changes
without a full nucleus restart. Bump the relevant module's VERSION file
whenever that module changes; nothing here needs editing when that
happens.

Shared by authn/api.py and authn/services.py -- kept in its own module
rather than living in either of those, since api.py already imports
from services.py and putting it in either one would risk a circular
import the other way.
"""
from pathlib import Path

from django.conf import settings

_MODULE_VERSION_FILES = {
    "nucleus_version": settings.BASE_DIR / "VERSION",
    "nexus_ai_version": Path("/nexus/ai/VERSION"),
    "nexus_transport_version": Path("/nexus/transport-version"),
}


def read_module_versions() -> dict:
    versions = {}
    for key, path in _MODULE_VERSION_FILES.items():
        try:
            versions[key] = path.read_text().strip()
        except FileNotFoundError:
            versions[key] = "unknown"
    return versions
