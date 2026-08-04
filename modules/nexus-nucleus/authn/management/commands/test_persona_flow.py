"""
Management command: python manage.py test_persona_flow

Exercises the full Persona lifecycle -- create -> list -> patch -> delete --
plus the RBAC rights checks around each step, in one run. No shell
copy-paste required; read the printed output top to bottom.

Rights being verified throughout (see authn/permissions/rights.py):
    persona.create / persona.update / persona.delete / persona.list are all
    COMPANY scope ONLY -- deliberately NOT extended to Project Admin, unlike
    agent.*/mcp_server.* (see USE_CASES.md UC6/UC7 and the Agent/MCPServer
    vs Persona asymmetry noted in ROLE_STORIES.md). So this command creates
    a second user who is Project Admin on the test project but holds NO
    company-wide role, and asserts every persona.* check comes back False
    for them, while list_personas() (row-visibility, not a blanket check)
    still lets them see it -- same "list never just 403s" pattern as every
    other resource type.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role
from intelligence import services as isvc
from nucleus.models import AIModel, Company, Project

User = get_user_model()


class Command(BaseCommand):
    help = "Exercise the full Persona CRUD lifecycle + rights checks in one run."

    def handle(self, *args, **options):
        self._line()
        self.stdout.write(self.style.NOTICE("Persona lifecycle test (create -> list -> patch -> delete)"))
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

        model = AIModel.objects.filter(company=company, is_active=True).first()
        if not model:
            self.stdout.write("No AIModel found -- creating a throwaway one for this test.")
            model = AIModel.objects.create(
                company=company, created_by=owner, name="Test Model for Persona Flow",
                provider="litellm", model_id="openai/gpt-test", licence_accepted=True,
            )

        self.stdout.write(f"Company: {company.name} | Owner: {owner.email} | "
                           f"Project: {project.name} | Model: {model.name}")

        # A second user: Project Admin on `project` ONLY, no company-wide role at
        # all. This is the user every persona.* can() check below must deny.
        project_admin, created = User.objects.get_or_create(
            username="test_project_admin_persona_flow",
            defaults={"email": "test_project_admin_persona_flow@test.local", "user_type": "human"},
        )
        admin_role = Role.objects.filter(company=company, name="Admin").first()
        if admin_role:
            PermissionChecker.assign_role(project_admin, admin_role, project, granted_by=owner)
        self.stdout.write(f"Test user: {project_admin.username} (Project Admin on '{project.name}' only, "
                           f"no company-wide role) {'[created]' if created else '[reused]'}")

        # ── 1. persona.create ────────────────────────────────────────────────
        self._section("1. CREATE -- persona.create (COMPANY scope only)")
        self._check("owner can create_persona", PermissionChecker.can(owner, "persona.create", company=company), True)
        self._check("project_admin can create_persona", PermissionChecker.can(project_admin, "persona.create", company=company), False)

        persona = isvc.create_persona(company, owner, {
            "name": "Nova Test Flow",
            "description": "Created by test_persona_flow management command.",
            "project_id": str(project.id),
            "source_type": "model",
            "model_id": str(model.id),
            "agent_id": None,
            "prompt": {
                "system_prompt": "You are Nova, a test persona.",
                "output_type": "text",
                "context_scope": "topic",
            },
        })
        self.stdout.write(f"  -> persona created: id={persona.id} name={persona.name!r} "
                           f"is_active={persona.is_active}")

        # ── 2. persona.list / visible_personas ──────────────────────────────
        self._section("2. LIST -- persona.list (blanket) vs visible_personas (row-visibility)")
        self._check("owner can persona.list (company-wide)", PermissionChecker.can(owner, "persona.list", company=company), True)
        self._check("project_admin can persona.list (company-wide)", PermissionChecker.can(project_admin, "persona.list", company=company), False)

        owner_sees = [p.name for p in isvc.list_personas(project, owner)]
        admin_sees = [p.name for p in isvc.list_personas(project, project_admin)]
        self.stdout.write(f"  -> owner's list_personas(project): {owner_sees}")
        self.stdout.write(f"  -> project_admin's list_personas(project) (expect to still see it -- "
                           f"narrow-path reach via their own project membership): {admin_sees}")

        # ── 3. persona.update ────────────────────────────────────────────────
        self._section("3. PATCH -- persona.update (COMPANY scope only)")
        self._check("owner can persona.update", PermissionChecker.can(owner, "persona.update", company=company), True)
        self._check("project_admin can persona.update", PermissionChecker.can(project_admin, "persona.update", company=company), False)

        updated = isvc.patch_persona(company, str(persona.id), {"description": "Updated by test_persona_flow."})
        self.stdout.write(f"  -> patched description: {updated.description!r}")

        # ── 4. persona.delete ────────────────────────────────────────────────
        self._section("4. DELETE -- persona.delete (COMPANY scope only)")
        self._check("owner can persona.delete", PermissionChecker.can(owner, "persona.delete", company=company), True)
        self._check("project_admin can persona.delete", PermissionChecker.can(project_admin, "persona.delete", company=company), False)

        result = isvc.delete_persona(company, str(persona.id))
        self.stdout.write(f"  -> delete_persona returned: {result}")

        persona.refresh_from_db()
        self.stdout.write(f"  -> persona.is_active after delete: {persona.is_active}")
        self.stdout.write(f"  -> persona.name after delete (mangled by design -- see delete_persona): {persona.name!r}")

        owner_sees_after = [p.name for p in isvc.list_personas(project, owner)]
        self.stdout.write(f"  -> list_personas(project) after delete (expect gone): {owner_sees_after}")

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
