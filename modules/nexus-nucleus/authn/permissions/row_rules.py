"""
authn/permissions/row_rules.py

Row-level visibility -- the Django-native equivalent of Odoo's ir.rule
"domain." Odoo stores a domain expression per (group, model) and lets
the ORM evaluate it dynamically at query time; here each rule is just a
plain Python function returning a queryset, since Django's ORM is
already the query language -- no separate domain DSL to invent or parse.

Distinct from PermissionChecker.can(): can() answers "may this user
act on THIS ONE object" (a boolean). These functions answer "which
objects can this user see at all" (an actual queryset -- could be
every object in the company, a handful, one, or none, depending on
what the user actually holds). Neither can substitute for the other.

No dispatcher/registry here on purpose -- callers just import and call
the function they need directly. A lookup table was tried and removed:
for a small, fixed set of functions it only added indirection an IDE
can't follow, with no real benefit -- see the design discussion this
is built from.
"""
from .checker import PermissionChecker
from .models import RoleAssignment


def _reachable_project_ids(user) -> set:
    """
    Every project id this user can reach via their own RoleAssignments --
    either directly (a project-scoped assignment) or indirectly (a
    topic-scoped assignment; that topic's parent project counts too, so
    the project still shows up as a navigation waypoint even though the
    user can't see its other channels/topics). Shared by every "narrow"
    fallback below, including the AI-resource ones which reuse the same
    "which projects can this user reach" question as the underlying
    visibility gate for models/agents/MCP servers attached to a project.
    """
    from nucleus.models import ChatTopic

    assignments = RoleAssignment.objects.filter(
        user=user, scope_object_type__in=["project", "topic"],
    )
    project_ids = {a.scope_object_id for a in assignments if a.scope_object_type == "project"}
    topic_ids = {a.scope_object_id for a in assignments if a.scope_object_type == "topic"}

    if topic_ids:
        project_ids |= set(
            ChatTopic.objects.filter(id__in=topic_ids).values_list("project_id", flat=True)
        )
    return project_ids


def visible_projects(user, company):
    """
    Every Project this user can see.

    Broad case: user holds the company-wide 'project.list' right ->
    every project in the company (Owner/Admin territory).

    Narrow case: no broad right -> only the projects reachable from the
    user's own RoleAssignments (see _reachable_project_ids).
    """
    from nucleus.models import Project

    if PermissionChecker.can(user, "project.list", company=company):
        return Project.objects.filter(company=company, is_active=True).order_by("name")

    project_ids = _reachable_project_ids(user)
    return Project.objects.filter(
        company=company, is_active=True, id__in=project_ids,
    ).order_by("name")


def visible_channels(user, project):
    """
    Every Channel in `project` this user can see.

    Broad case: user's assignment reaches 'channel.list' on this project
    (Project-scoped Admin/Member, or Company-scoped) -> every channel in it.

    Narrow case: user only holds a Topic-scoped assignment somewhere in
    this project -> only the channel(s) containing a topic they're
    actually scoped to. This is the same "waypoint, not full access"
    rule as visible_projects, one level down: the channel surfaces so
    they can navigate to their topic, but sibling topics/channels stay
    hidden -- enforced by visible_topics below, not here.
    """
    from nucleus.models import Channel, ChatTopic

    if PermissionChecker.can(user, "channel.list", obj=project):
        return Channel.objects.filter(project=project, is_active=True).order_by("name")

    topic_ids = set(
        RoleAssignment.objects.filter(
            user=user, scope_object_type="topic",
        ).values_list("scope_object_id", flat=True)
    )
    channel_ids = set()
    if topic_ids:
        channel_ids = set(
            ChatTopic.objects.filter(id__in=topic_ids, project=project).values_list("channel_id", flat=True)
        )

    return Channel.objects.filter(
        project=project, is_active=True, id__in=channel_ids,
    ).order_by("name")


def visible_topics(user, channel):
    """
    Every ChatTopic in `channel` this user can see.

    Broad case: user's assignment reaches 'topic.list' on this channel's
    project (Project-scoped or Company-scoped) -> every topic in it.

    Narrow case: only the specific topic(s) the user holds a direct
    Topic-scoped RoleAssignment on -- this is the actual enforcement
    point for "invited to one topic, can't see sibling topics."
    """
    from nucleus.models import ChatTopic

    if PermissionChecker.can(user, "topic.list", obj=channel):
        return ChatTopic.objects.filter(channel=channel, is_active=True).order_by("created_at")

    topic_ids = set(
        RoleAssignment.objects.filter(
            user=user, scope_object_type="topic",
        ).values_list("scope_object_id", flat=True)
    )
    return ChatTopic.objects.filter(
        channel=channel, is_active=True, id__in=topic_ids,
    ).order_by("created_at")


# ── AI resources (Model / Agent / MCP Server) ──────────────────────────────────
# These three are company-owned (created/deleted only by a company-scope
# admin -- see intelligence/api.py), but VISIBILITY is project-gated via
# the `projects` M2M field added to each model (nucleus/models/intelligence.py).
# A resource with no projects attached is invisible to everyone without the
# broad company-wide *.list right, including its own creator -- attachment
# is a separate, explicit step (see intelligence/services.py attach_*).

def visible_ai_models(user, company):
    """
    Broad case: 'ai_model.list' company-wide right -> every model in the company.
    Narrow case: only models attached (via the `projects` M2M) to a project
    this user can reach.
    """
    from nucleus.models import AIModel

    if PermissionChecker.can(user, "ai_model.list", company=company):
        return AIModel.objects.filter(company=company, is_active=True).order_by("name")

    project_ids = _reachable_project_ids(user)
    return AIModel.objects.filter(
        company=company, is_active=True, projects__id__in=project_ids,
    ).distinct().order_by("name")


def visible_agents(user, company):
    """Same broad/narrow shape as visible_ai_models, for AIAgent."""
    from nucleus.models import AIAgent

    if PermissionChecker.can(user, "agent.list", company=company):
        return AIAgent.objects.filter(company=company, is_active=True).order_by("name")

    project_ids = _reachable_project_ids(user)
    return AIAgent.objects.filter(
        company=company, is_active=True, projects__id__in=project_ids,
    ).distinct().order_by("name")


def visible_mcp_servers(user, company):
    """
    MCP servers are project-wide available by design (see the NOTE on
    MCPServer in nucleus/models/intelligence.py) -- unlike AIModel/AIAgent,
    there's no per-resource attachment to curate. Anyone who belongs to at
    least one project sees every active MCP server in the company; anyone
    with no project footprint at all (and no broad company-wide right)
    sees none.

    This also sidesteps a real gap in the rights design: 'mcp_server.list'
    is a COMPANY-scope right, but per the locked role design a Member's
    RoleAssignment is only ever PROJECT-scoped ("no company member") --
    they could never hold a COMPANY-scope right no matter what's in their
    role's default rights. Gating on "has any project footprint" instead
    of the unreachable company-scope right is what actually makes this
    usable for ordinary project members.
    """
    from nucleus.models import MCPServer

    if PermissionChecker.can(user, "mcp_server.list", company=company):
        return MCPServer.objects.filter(company=company, is_active=True).order_by("name")

    if _reachable_project_ids(user):
        return MCPServer.objects.filter(company=company, is_active=True).order_by("name")

    return MCPServer.objects.none()
