"""
Management command: python manage.py test_workspace_flow

Exercises the full Project -> Channel -> Topic lifecycle, plus the RBAC
rights checks around every step, in one run. Same shape as
test_persona_flow.py / test_agent_flow.py / test_mcp_server_flow.py /
test_ai_model_flow.py.

Covers your original 10-item list end to end:
    1  list_projects       6  create_channel
    2  create_project      7  list_topics
    3  get_project         8  create_topic
    4  archive_project*    9  update_topic
    5  list_channels       10 mark_topic_read
    (* renamed from delete_project this session -- see rights.py)

Plus two bonus items that didn't exist when that list was first written:
    11 archive_channel  12 archive_topic  -- new archive-policy endpoints
    from this session, exercised the same way as archive_project.

Rights shape (see authn/permissions/rights.py):
    project.create / project.list are COMPANY scope, checked as
    company=company -- a Project Admin never reaches these before a
    project exists to be scoped to (matches ai_model.create's shape).

    project.view / project.archive / channel.create / channel.list /
    channel.archive / topic.create / topic.list / topic.update /
    topic.mark_read / topic.archive are ALL checked as obj=<the actual
    object>, and their scope (PROJECT or TOPIC) is reachable by a
    Project-scoped Admin RoleAssignment on `project` -- UNLIKE the AI
    resource list rights (ai_model.list, agent.list, mcp_server.list),
    which stay COMPANY-scope blanket checks even though row-visibility
    still shows narrower users a filtered list. Channels/topics don't
    have that split: project_admin gets a straight True on channel.list/
    topic.list via obj=, no row-visibility fallback needed.

    other_admin (Project Admin on a DIFFERENT project) is denied on
    every single check below, proving project-to-project isolation one
    more time at this resource layer.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role
from workspace import services as wsvc
from nucleus.models import Company

User = get_user_model()


class Command(BaseCommand):
    help = "Exercise the full Project/Channel/Topic CRUD + archive lifecycle + rights checks in one run."

    def handle(self, *args, **options):
        self._line()
        self.stdout.write(self.style.NOTICE("Workspace lifecycle test (Project -> Channel -> Topic, create through archive)"))
        self._line()

        # ── Fixtures ─────────────────────────────────────────────────────────
        company = Company.objects.filter(is_active=True).first()
        if not company:
            self.stdout.write(self.style.ERROR("No company found -- run 'manage.py create_owner' first."))
            return
        owner = company.owner
        self.stdout.write(f"Company: {company.name} | Owner: {owner.email}")

        admin_role = Role.objects.filter(company=company, name="Admin").first()

        project_admin, created = User.objects.get_or_create(
            username="test_project_admin_workspace_flow",
            defaults={"email": "test_project_admin_workspace_flow@test.local", "user_type": "human"},
        )
        other_admin, created2 = User.objects.get_or_create(
            username="test_other_project_admin_workspace_flow",
            defaults={"email": "test_other_project_admin_workspace_flow@test.local", "user_type": "human"},
        )
        self.stdout.write(f"Test user 1: {project_admin.username} {'[created]' if created else '[reused]'} "
                           f"-- no role yet, will become Project Admin on the new project")
        self.stdout.write(f"Test user 2: {other_admin.username} {'[created]' if created2 else '[reused]'} "
                           f"-- will become Project Admin on a DIFFERENT project")

        # ── ITEM 2 -- project.create (COMPANY scope) ────────────────────────
        self._section("ITEM 2 -- CREATE -- project.create (COMPANY scope)")
        self._check("owner can project.create", PermissionChecker.can(owner, "project.create", company=company), True)
        self._check("project_admin can project.create -- EXPECT False, no role at all yet",
                     PermissionChecker.can(project_admin, "project.create", company=company), False)

        project = wsvc.create_project(company=company, user=owner, name="Workspace Flow Test Project",
                                       description="Created by test_workspace_flow.")
        other_project = wsvc.create_project(company=company, user=owner, name="Workspace Flow Isolation Project",
                                             description="Isolation target for test_workspace_flow.")
        self.stdout.write(f"  -> project created: id={project.id} name={project.name!r} "
                           f"(auto-created channel: {[c.name for c in project.channel_items.all()]})")
        self.stdout.write(f"  -> other_project created: id={other_project.id} name={other_project.name!r}")

        # Now assign project-scoped Admin to each test user, on their respective project.
        if admin_role:
            PermissionChecker.assign_role(project_admin, admin_role, project, granted_by=owner)
            PermissionChecker.assign_role(other_admin, admin_role, other_project, granted_by=owner)

        # ── ITEM 1 -- project.list (COMPANY scope, blanket + row-visibility) ─
        self._section("ITEM 1 -- LIST -- project.list (COMPANY scope, blanket) vs visible_projects (row-visibility)")
        self._check("owner can project.list (company-wide)", PermissionChecker.can(owner, "project.list", company=company), True)
        self._check("project_admin can project.list (company-wide)", PermissionChecker.can(project_admin, "project.list", company=company), False)

        admin_sees = [p.name for p in wsvc.list_projects(company, project_admin)]
        other_admin_sees = [p.name for p in wsvc.list_projects(company, other_admin)]
        self.stdout.write(f"  -> project_admin's list_projects (expect only their own, via narrow row-visibility): {admin_sees}")
        self.stdout.write(f"  -> other_admin's list_projects (expect only THEIR own): {other_admin_sees}")

        # ── ITEM 3 -- project.view ───────────────────────────────────────────
        self._section("ITEM 3 -- GET -- project.view (PROJECT scope, obj=project)")
        self._check("owner can project.view", PermissionChecker.can(owner, "project.view", obj=project), True)
        self._check("project_admin can project.view (own project)", PermissionChecker.can(project_admin, "project.view", obj=project), True)
        self._check("other_admin can project.view (different project)", PermissionChecker.can(other_admin, "project.view", obj=project), False)

        fetched = wsvc.get_project(company, project_admin, str(project.id))
        self.stdout.write(f"  -> project_admin's get_project: {fetched.name if fetched else None}")
        fetched_by_other = wsvc.get_project(company, other_admin, str(project.id))
        self.stdout.write(f"  -> other_admin's get_project (expect None): {fetched_by_other}")

        # ── ITEM 5 -- channel.list ────────────────────────────────────────
        self._section("ITEM 5 -- LIST -- channel.list (PROJECT scope, obj=project -- straight True, no narrow fallback needed)")
        self._check("owner can channel.list", PermissionChecker.can(owner, "channel.list", obj=project), True)
        self._check("project_admin can channel.list (own project)", PermissionChecker.can(project_admin, "channel.list", obj=project), True)
        self._check("other_admin can channel.list (different project)", PermissionChecker.can(other_admin, "channel.list", obj=project), False)

        channels_before = [c.name for c in wsvc.list_channels(project_admin, project)]
        self.stdout.write(f"  -> project_admin's list_channels (expect just the auto-created 'general'): {channels_before}")

        # ── ITEM 6 -- channel.create ─────────────────────────────────────
        self._section("ITEM 6 -- CREATE -- channel.create (PROJECT scope, obj=project)")
        self._check("owner can channel.create", PermissionChecker.can(owner, "channel.create", obj=project), True)
        self._check("project_admin can channel.create (own project)", PermissionChecker.can(project_admin, "channel.create", obj=project), True)
        self._check("other_admin can channel.create (different project)", PermissionChecker.can(other_admin, "channel.create", obj=project), False)

        channel = wsvc.create_channel(company=company, project=project, name="marketing", description="Test channel.")
        self.stdout.write(f"  -> channel created: id={channel.id} name={channel.name!r}")

        # ── ITEM 7 -- topic.list ─────────────────────────────────────────
        self._section("ITEM 7 -- LIST -- topic.list (PROJECT scope, obj=channel)")
        self._check("owner can topic.list", PermissionChecker.can(owner, "topic.list", obj=channel), True)
        self._check("project_admin can topic.list (own project's channel)", PermissionChecker.can(project_admin, "topic.list", obj=channel), True)
        self._check("other_admin can topic.list (different project)", PermissionChecker.can(other_admin, "topic.list", obj=channel), False)

        topics_before = [t.title for t in wsvc.list_topics(project_admin, channel)]
        self.stdout.write(f"  -> project_admin's list_topics (expect []): {topics_before}")

        # ── ITEM 8 -- topic.create ────────────────────────────────────────
        self._section("ITEM 8 -- CREATE -- topic.create (PROJECT scope, obj=channel)")
        self._check("owner can topic.create", PermissionChecker.can(owner, "topic.create", obj=channel), True)
        self._check("project_admin can topic.create (own project's channel)", PermissionChecker.can(project_admin, "topic.create", obj=channel), True)
        self._check("other_admin can topic.create (different project)", PermissionChecker.can(other_admin, "topic.create", obj=channel), False)

        topic = wsvc.create_topic(company=company, project=project, channel=channel, title="Launch Plan", creator=owner)
        self.stdout.write(f"  -> topic created: id={topic.id} title={topic.title!r}")

        # ── ITEM 9 -- topic.update ────────────────────────────────────────
        self._section("ITEM 9 -- UPDATE -- topic.update (TOPIC scope, obj=topic -- reachable via PROJECT-scope Admin too)")
        self._check("owner can topic.update", PermissionChecker.can(owner, "topic.update", obj=topic), True)
        self._check("project_admin can topic.update (own project's topic)", PermissionChecker.can(project_admin, "topic.update", obj=topic), True)
        self._check("other_admin can topic.update (different project)", PermissionChecker.can(other_admin, "topic.update", obj=topic), False)

        updated_topic = wsvc.update_topic(project, channel, topic, "Marketing Launch Plan")
        self.stdout.write(f"  -> topic renamed: {updated_topic.title!r}")

        # ── ITEM 10 -- topic.mark_read ────────────────────────────────────
        self._section("ITEM 10 -- MARK READ -- topic.mark_read (TOPIC scope, obj=topic)")
        self._check("owner can topic.mark_read", PermissionChecker.can(owner, "topic.mark_read", obj=topic), True)
        self._check("project_admin can topic.mark_read (own project's topic)", PermissionChecker.can(project_admin, "topic.mark_read", obj=topic), True)
        self._check("other_admin can topic.mark_read (different project)", PermissionChecker.can(other_admin, "topic.mark_read", obj=topic), False)

        wsvc.mark_topic_read(owner, topic)
        self.stdout.write("  -> mark_topic_read called (no-op with no messages in the topic yet -- expected, see create_ai_message/save_user_message).")

        # ── BONUS ITEM 12 -- topic.archive ────────────────────────────────
        self._section("BONUS ITEM 12 -- ARCHIVE -- topic.archive (TOPIC scope, obj=topic) -- new this session")
        self._check("owner can topic.archive", PermissionChecker.can(owner, "topic.archive", obj=topic), True)
        self._check("project_admin can topic.archive (own project's topic)", PermissionChecker.can(project_admin, "topic.archive", obj=topic), True)
        self._check("other_admin can topic.archive (different project)", PermissionChecker.can(other_admin, "topic.archive", obj=topic), False)

        wsvc.archive_topic(topic)
        self.stdout.write(f"  -> topic.is_active after archive: {topic.is_active}")
        self.stdout.write(f"  -> list_topics default (expect []): {[t.title for t in wsvc.list_topics(owner, channel)]}")
        self.stdout.write(f"  -> list_topics include_archived (expect the topic back): "
                           f"{[t.title for t in wsvc.list_topics(owner, channel, include_archived=True)]}")

        # ── BONUS ITEM 11 -- channel.archive ──────────────────────────────
        self._section("BONUS ITEM 11 -- ARCHIVE -- channel.archive (PROJECT scope, obj=channel) -- new this session")
        self._check("owner can channel.archive", PermissionChecker.can(owner, "channel.archive", obj=channel), True)
        self._check("project_admin can channel.archive (own project)", PermissionChecker.can(project_admin, "channel.archive", obj=channel), True)
        self._check("other_admin can channel.archive (different project)", PermissionChecker.can(other_admin, "channel.archive", obj=channel), False)

        wsvc.archive_channel(channel)
        self.stdout.write(f"  -> channel.is_active after archive: {channel.is_active}")
        self.stdout.write(f"  -> list_channels default (expect just 'general'): {[c.name for c in wsvc.list_channels(owner, project)]}")
        self.stdout.write(f"  -> list_channels include_archived (expect both): "
                           f"{[c.name for c in wsvc.list_channels(owner, project, include_archived=True)]}")

        # ── ITEM 4 -- project.archive (renamed from delete_project) ────────
        self._section("ITEM 4 -- ARCHIVE -- project.archive (PROJECT scope, obj=project) -- renamed from delete_project this session")
        self._check("owner can project.archive", PermissionChecker.can(owner, "project.archive", obj=project), True)
        self._check("project_admin can project.archive (own project)", PermissionChecker.can(project_admin, "project.archive", obj=project), True)
        self._check("other_admin can project.archive (different project)", PermissionChecker.can(other_admin, "project.archive", obj=project), False)

        wsvc.archive_project(project)
        self.stdout.write(f"  -> project.is_active after archive: {project.is_active}")
        self.stdout.write(f"  -> list_projects default (expect it gone): {[p.name for p in wsvc.list_projects(company, owner)]}")
        self.stdout.write(f"  -> list_projects include_archived (expect it back): "
                           f"{[p.name for p in wsvc.list_projects(company, owner, include_archived=True)]}")

        self._line()
        self.stdout.write(self.style.SUCCESS("Done."))

    # ── helpers ──────────────────────────────────────────────────────────────

    def _line(self):
        self.stdout.write("=" * 78)

    def _section(self, title):
        self.stdout.write("")
        self.stdout.write(self.style.NOTICE(f"-- {title} --"))

    def _check(self, label, actual, expected):
        match = actual == expected
        marker = "PASS" if match else "FAIL"
        style = self.style.SUCCESS if match else self.style.ERROR
        self.stdout.write(style(f"  [{marker}] {label}: {actual} (expected {expected})"))
