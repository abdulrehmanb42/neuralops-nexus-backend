"""
Management command: python manage.py test_agent_flow

Exercises the full AIAgent lifecycle -- create -> list -> patch -> delete --
plus the RBAC rights checks around each step, in one run. Same shape as
test_persona_flow.py, but the expected results are the OPPOSITE for the
project-admin checks -- that's the actual point of this command.

Rights being verified throughout (see authn/permissions/rights.py):
    agent.create / agent.update / agent.delete are PROJECT scope -- unlike
    Persona, a Project Admin on the agent's own project CAN reach these
    without any company-wide role (see USE_CASES.md UC16). agent.list stays
    COMPANY scope for the blanket check, but ordinary project members still
    see their project's agents via the visible_agents() row-visibility
    fallback -- same "list never just 403s" pattern as everywhere else.

    This command also proves project-to-project isolation (UC17): a second
    Project Admin, scoped to a DIFFERENT project, should be denied on every
    check against this agent, since _scope_chain() only reaches through the
    agent's own project.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role
from intelligence import services as isvc
from nucleus.models import AIModel, Company, Project

User = get_user_model()


class Command(BaseCommand):
    help = "Exercise the full AIAgent CRUD lifecycle + rights checks in one run."

    def handle(self, *args, **options):
        self._line()
        self.stdout.write(self.style.NOTICE("Agent lifecycle test (create -> list -> patch -> delete)"))
        self._line()

        # ── Fixtures ─────────────────────────────────────────────────────────
        company = Company.objects.filter(is_active=True).first()
        if not company:
            self.stdout.write(self.style.ERROR("No company found -- run 'manage.py create_owner' first."))
            return
        owner = company.owner

        project = Project.objects.filter(company=company, is_active=True).first()
        if not project:
            self.stdout.write(self.style.ERROR("No active project found -- create one first (wsvc.create_project)."))
            return

        other_project, _ = Project.objects.get_or_create(
            company=company, slug="other-project-agent-flow",
            defaults={"name": "Other Project (agent flow isolation test)"},
        )

        model = AIModel.objects.filter(company=company, is_active=True).first()
        if not model:
            self.stdout.write("No AIModel found -- creating a throwaway one for this test.")
            model = AIModel.objects.create(
                company=company, created_by=owner, name="Test Model for Agent Flow",
                provider="litellm", model_id="openai/gpt-test", licence_accepted=True,
            )

        self.stdout.write(f"Company: {company.name} | Owner: {owner.email} | "
                           f"Project: {project.name} | Other project: {other_project.name} | Model: {model.name}")

        admin_role = Role.objects.filter(company=company, name="Admin").first()

        # Project Admin on `project` ONLY -- expect this user to reach every
        # agent.* right on THIS project's agent, no company-wide role needed.
        project_admin, created = User.objects.get_or_create(
            username="test_project_admin_agent_flow",
            defaults={"email": "test_project_admin_agent_flow@test.local", "user_type": "human"},
        )
        if admin_role:
            PermissionChecker.assign_role(project_admin, admin_role, project, granted_by=owner)
        self.stdout.write(f"Test user 1: {project_admin.username} (Project Admin on '{project.name}' only) "
                           f"{'[created]' if created else '[reused]'}")

        # Project Admin on a DIFFERENT project -- expect every check below to
        # be denied for this user, proving project-to-project isolation.
        other_admin, created2 = User.objects.get_or_create(
            username="test_other_project_admin_agent_flow",
            defaults={"email": "test_other_project_admin_agent_flow@test.local", "user_type": "human"},
        )
        if admin_role:
            PermissionChecker.assign_role(other_admin, admin_role, other_project, granted_by=owner)
        self.stdout.write(f"Test user 2: {other_admin.username} (Project Admin on '{other_project.name}' only) "
                           f"{'[created]' if created2 else '[reused]'}")

        # ── 1. agent.create ──────────────────────────────────────────────────
        self._section("1. CREATE -- agent.create (PROJECT scope, obj=project)")
        self._check("owner can agent.create on project", PermissionChecker.can(owner, "agent.create", obj=project), True)
        self._check("project_admin can agent.create on project (own project)", PermissionChecker.can(project_admin, "agent.create", obj=project), True)
        self._check("other_admin can agent.create on project (different project)", PermissionChecker.can(other_admin, "agent.create", obj=project), False)

        agent = isvc.create_agent(company, {
            "name": "Scout Test Flow",
            "description": "Created by test_agent_flow management command.",
            "project_id": str(project.id),
            "model_id": str(model.id),
            "agent_type": "internal",
            "system_prompt": "You are Scout, a test agent.",
        })
        self.stdout.write(f"  -> agent created: id={agent.id} name={agent.name!r} is_active={agent.is_active}")

        # ── 2. agent.list / visible_agents ──────────────────────────────────
        self._section("2. LIST -- agent.list (blanket, company-wide) vs visible_agents (row-visibility)")
        self._check("owner can agent.list (company-wide)", PermissionChecker.can(owner, "agent.list", company=company), True)
        self._check("project_admin can agent.list (company-wide)", PermissionChecker.can(project_admin, "agent.list", company=company), False)

        owner_sees = [a.name for a in isvc.list_agents(company, owner)]
        admin_sees = [a.name for a in isvc.list_agents(company, project_admin)]
        other_admin_sees = [a.name for a in isvc.list_agents(company, other_admin)]
        self.stdout.write(f"  -> owner's list_agents: {owner_sees}")
        self.stdout.write(f"  -> project_admin's list_agents (expect to still see it -- narrow-path reach): {admin_sees}")
        self.stdout.write(f"  -> other_admin's list_agents (expect NOT to see it -- different project): {other_admin_sees}")

        # ── 3. agent.update ──────────────────────────────────────────────────
        self._section("3. PATCH -- agent.update (PROJECT scope, obj=agent, via _scope_chain M2M walk)")
        self._check("owner can agent.update", PermissionChecker.can(owner, "agent.update", obj=agent), True)
        self._check("project_admin can agent.update (own project's agent)", PermissionChecker.can(project_admin, "agent.update", obj=agent), True)
        self._check("other_admin can agent.update (different project)", PermissionChecker.can(other_admin, "agent.update", obj=agent), False)

        updated = isvc.update_agent(company, str(agent.id), {"description": "Updated by test_agent_flow."})
        self.stdout.write(f"  -> patched description: {updated.description!r}")

        # ── 4. agent.delete ──────────────────────────────────────────────────
        self._section("4. DELETE -- agent.delete (PROJECT scope, obj=agent)")
        self._check("owner can agent.delete", PermissionChecker.can(owner, "agent.delete", obj=agent), True)
        self._check("project_admin can agent.delete (own project's agent)", PermissionChecker.can(project_admin, "agent.delete", obj=agent), True)
        self._check("other_admin can agent.delete (different project)", PermissionChecker.can(other_admin, "agent.delete", obj=agent), False)

        result = isvc.delete_agent(company, str(agent.id))
        self.stdout.write(f"  -> delete_agent returned: {result}")

        agent.refresh_from_db()
        self.stdout.write(f"  -> agent.is_active after delete: {agent.is_active}")

        owner_sees_after = [a.name for a in isvc.list_agents(company, owner)]
        self.stdout.write(f"  -> owner's list_agents after delete (expect gone): {owner_sees_after}")

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
