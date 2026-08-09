"""
debug_playground.py

Standalone, debuggable version of the shell tests we've been running.
Run this directly in VSCode (F5, or "Run Python File") and set
breakpoints anywhere inside a test_* function -- since it's a real
script (not pasted into a REPL), the debugger can step through it,
inspect variables, and re-run individual functions without retyping
anything.

Lives at the repo root next to manage.py (modules/nexus-nucleus/) so
`core.settings` and every app import below resolves the same way it
does for manage.py itself.

How to add a new method to debug:
    Tell me the method/API name -- I'll add a new test_<name>() function
    below, following the same shape as the existing ones, and wire it
    into the __main__ block at the bottom. You just re-run the file.

VSCode setup (one-time) -- create .vscode/launch.json in the repo root:

    {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "Debug playground",
                "type": "debugpy",
                "request": "launch",
                "program": "${workspaceFolder}/modules/nexus-nucleus/debug_playground.py",
                "console": "integratedTerminal",
                "cwd": "${workspaceFolder}/modules/nexus-nucleus"
            }
        ]
    }

Then: set a breakpoint on any line inside a test_*() function, hit F5
with "Debug playground" selected, and step through exactly like the
shell tests -- except now you can inspect every intermediate variable,
not just what you remembered to print().
"""
import os
import sys
import django

# ── Django bootstrap (same thing manage.py does before any app import works) ──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

# ── Now safe to import Django apps ─────────────────────────────────────────────
from django.contrib.auth import get_user_model
from nucleus.models import Company
from workspace import services as wsvc
from intelligence import services as isvc
from chat import services as chat_svc
from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role

User = get_user_model()


# ── Shared fixtures -- fetched, not recreated, so this is safe to re-run ──────

def get_fixtures():
    """
    Pulls the company/owner/project that already exist in your DB from the
    earlier shell testing session. Adjust the lookups here if your actual
    data differs (e.g. if you've flushed again since).
    """
    company = Company.objects.first()
    owner = company.owner
    project = wsvc.list_projects(company, owner).first()
    return company, owner, project


# ── Tests -- one function per method, add more as you ask for them ────────────

def test_list_projects():
    company, owner, project = get_fixtures()
    result = list(wsvc.list_projects(company, owner))
    print("list_projects:", [p.name for p in result])
    return result


if __name__ == "__main__":
    print("=" * 60)
    test_list_projects()
    print("=" * 60)
