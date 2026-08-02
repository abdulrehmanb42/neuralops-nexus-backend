"""
authn/permissions/rights.py

The full Right registry, as plain Python data. This is the list you
asked for early on — one place listing every action that exists in the
system, before any of it touches the database.

Nothing here talks to Django's ORM. `manage.py seed_permissions` (see
authn/management/commands/seed_permissions.py) reads REGISTRY and
create-or-updates the matching `Right` rows, and seeds the four default
Roles (Owner / Admin / Member / Viewer) with their default RoleRight
sets for a given company.

To add a new right: add one line to REGISTRY, then re-run
`manage.py seed_permissions`. Nothing else needs to change for the right
to exist — you still have to decide which default role(s) get it, in
DEFAULT_ROLE_RIGHTS below.
"""
from .models import ObjectType, ScopeType

# ── The registry ──────────────────────────────────────────────────────────────
# (code, object_type, scope, description)
#
# `scope` = the NARROWEST level this right can be granted at. A right
# scoped to TOPIC can also be granted via a broader PROJECT or COMPANY
# assignment (reach flows downward) — see ScopeType docstring in models.py.
REGISTRY = [
    # ── Company ─────────────────────────────────────────────────────────────
    ("company.invite_member", ObjectType.COMPANY, ScopeType.COMPANY,
     "Invite a new user to join the company."),
    ("company.remove_member", ObjectType.COMPANY, ScopeType.COMPANY,
     "Remove a user from the company entirely."),

    # ── Project ─────────────────────────────────────────────────────────────
    # create/list are COMPANY-scope: there's no existing project to "reach up"
    # from when the project doesn't exist yet.
    ("project.create", ObjectType.PROJECT, ScopeType.COMPANY,
     "Create a new project."),
    ("project.list", ObjectType.PROJECT, ScopeType.COMPANY,
     "List every project this user has visibility into."),
    # view/delete can be granted at PROJECT scope directly (someone made
    # Owner/Admin of just one project) as well as inherited from COMPANY.
    ("project.view", ObjectType.PROJECT, ScopeType.PROJECT,
     "View a specific project's details."),
    ("project.delete", ObjectType.PROJECT, ScopeType.PROJECT,
     "Delete (soft-delete) a project. Irreversible in practice — Owner-tier action."),

    # ── Channel ─────────────────────────────────────────────────────────────
    # Channels are not their own assignable scope — they're always reached
    # through their parent Project.
    ("channel.create", ObjectType.CHANNEL, ScopeType.PROJECT,
     "Create a new channel inside a project."),
    ("channel.list", ObjectType.CHANNEL, ScopeType.PROJECT,
     "List the channels inside a project."),
    ("channel.update", ObjectType.CHANNEL, ScopeType.PROJECT,
     "Rename / edit a channel's description. (No update endpoint exists yet as of this writing.)"),

    # ── Chat Topic ──────────────────────────────────────────────────────────
    ("topic.create", ObjectType.TOPIC, ScopeType.PROJECT,
     "Create a new topic inside a channel. Reaches down from Project scope."),
    ("topic.list", ObjectType.TOPIC, ScopeType.PROJECT,
     "List the topics inside a channel."),
    ("topic.update", ObjectType.TOPIC, ScopeType.TOPIC,
     "Rename a topic. Grantable narrowly (this topic only) or from a broader scope."),
    ("topic.mark_read", ObjectType.TOPIC, ScopeType.TOPIC,
     "Mark a topic as read for yourself."),

    # ── Chat Session (the @session mechanism) ──────────────────────────────
    ("session.create", ObjectType.SESSION, ScopeType.TOPIC,
     "Open an AI session against one or more personas within a topic."),
    ("session.close", ObjectType.SESSION, ScopeType.TOPIC,
     "Close an active AI session in a topic."),

    # ── Persona mention (using AI, distinct from managing Persona records) ─
    ("persona.mention", ObjectType.PERSONA, ScopeType.TOPIC,
     "Trigger an AI response by @mentioning a persona in a topic."),

    # ── AI Intelligence infrastructure — COMPANY scope ONLY. ───────────────
    # These resources have no project boundary (see workspace API routes:
    # /api/v1/personas/, /api/v1/mcp-servers/, /api/v1/agents/,
    # /api/v1/ai-models/ — none take a project_id). A Project-scoped Admin
    # must NOT inherit these: creating one of these affects the whole
    # company, not just one project. Only a COMPANY-scoped assignment can
    # grant them.
    ("persona.list", ObjectType.PERSONA, ScopeType.COMPANY, "List personas."),
    ("persona.create", ObjectType.PERSONA, ScopeType.COMPANY, "Create a persona."),
    ("persona.update", ObjectType.PERSONA, ScopeType.COMPANY, "Edit a persona."),
    ("persona.delete", ObjectType.PERSONA, ScopeType.COMPANY, "Delete a persona."),

    ("agent.list", ObjectType.AGENT, ScopeType.COMPANY, "List AI agents."),
    ("agent.create", ObjectType.AGENT, ScopeType.COMPANY, "Create an AI agent."),
    ("agent.delete", ObjectType.AGENT, ScopeType.COMPANY, "Delete an AI agent."),

    ("mcp_server.list", ObjectType.MCP_SERVER, ScopeType.COMPANY, "List MCP servers."),
    ("mcp_server.create", ObjectType.MCP_SERVER, ScopeType.COMPANY, "Register a new MCP server."),
    ("mcp_server.delete", ObjectType.MCP_SERVER, ScopeType.COMPANY, "Delete an MCP server."),

    ("ai_model.list", ObjectType.AI_MODEL, ScopeType.COMPANY, "List AI models."),
    ("ai_model.create", ObjectType.AI_MODEL, ScopeType.COMPANY, "Register a new AI model."),
    ("ai_model.delete", ObjectType.AI_MODEL, ScopeType.COMPANY, "Delete an AI model."),
]


# ── Default rights per seeded role ─────────────────────────────────────────────
# Keyed by role name. Used by seed_permissions to build the starting
# RoleRight rows for the four default roles every company gets. These are
# a starting point, not a hard rule — a company can edit them afterward,
# same as any other Role.
#
# Deliberately excluded from MEMBER and VIEWER: persona/agent/mcp_server/
# ai_model create+delete rights, and project.delete — matches everything
# decided in design discussion (Member never gets company-wide infra
# rights regardless of scope; only Owner/Admin do).
DEFAULT_ROLE_RIGHTS = {
    "Owner": [code for code, *_ in REGISTRY],  # everything, no exceptions

    "Admin": [
        "company.invite_member", "company.remove_member",
        "project.create", "project.list", "project.view",
        "channel.create", "channel.list", "channel.update",
        "topic.create", "topic.list", "topic.update", "topic.mark_read",
        "session.create", "session.close",
        "persona.mention",
        "persona.list", "persona.create", "persona.update", "persona.delete",
        "agent.list", "agent.create", "agent.delete",
        "mcp_server.list", "mcp_server.create", "mcp_server.delete",
        "ai_model.list", "ai_model.create", "ai_model.delete",
        # Note: project.delete intentionally NOT included — Owner-only,
        # irreversible action. Revisit if that's too strict.
    ],

    "Member": [
        "project.list", "project.view",
        "channel.list",
        "topic.create", "topic.list", "topic.update", "topic.mark_read",
        "session.create", "session.close",
        "persona.mention",
        "persona.list", "agent.list", "mcp_server.list", "ai_model.list",
    ],

    "Viewer": [
        "project.list", "project.view",
        "channel.list",
        "topic.list", "topic.mark_read",
        "persona.list", "agent.list", "mcp_server.list", "ai_model.list",
        # Deliberately no session.*, no persona.mention, no *.create/update/delete.
        # topic.mark_read is the one exception: it's a personal read-state
        # marker, not a write to shared content, so every role gets it.
    ],
}
