"""
Management command: python manage.py test_ai_model_flow

Exercises the full AIModel lifecycle -- create -> list -> attach -> detach ->
delete -- plus the RBAC rights checks around each step. Same shape as
test_persona_flow.py / test_agent_flow.py / test_mcp_server_flow.py.

Rights being verified (see authn/permissions/rights.py + USE_CASES.md UC14/UC15):
    ai_model.create / ai_model.delete are COMPANY scope ONLY -- unlike
    Agent/MCPServer, a Project Admin never reaches these regardless of
    which project they administer, because creating/deleting a model
    touches the Fernet-encrypted API key. This command's project_admin
    (Project Admin on `project`, no company-wide role) should be denied
    on both create and delete.

    ai_model.attach is the deliberate exception -- PROJECT scope, checked
    as obj=project, never touches the key. project_admin SHOULD reach this
    on their own project (and detach, which reuses the same right code),
    but not on a different project (other_admin).

    Also demonstrates the "unattached = invisible to everyone but a
    company-wide list holder" rule from UC13/UC15: right after creation,
    before any attach call, project_admin's list_ai_models() comes back
    empty even though they're a genuine member of `project` -- attachment
    is what makes a model visible via the narrow/row-visibility path, not
    just being in a project at all.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role
from intelligence import services as isvc
from nucleus.models import Company, Project

User = get_user_model()


class Command(BaseCommand):
    help = "Exercise the full AIModel CRUD + attach/detach lifecycle + rights checks in one run."

    def handle(self, *args, **options):
        self._line()
        self.stdout.write(self.style.NOTICE("AI Model lifecycle test (create -> list -> attach -> detach -> delete)"))
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
            company=company, slug="other-project-ai-model-flow",
            defaults={"name": "Other Project (ai model flow isolation test)"},
        )

        self.stdout.write(f"Company: {company.name} | Owner: {owner.email} | "
                           f"Project: {project.name} | Other project: {other_project.name}")

        admin_role = Role.objects.filter(company=company, name="Admin").first()

        project_admin, created = User.objects.get_or_create(
            username="test_project_admin_ai_model_flow",
            defaults={"email": "test_project_admin_ai_model_flow@test.local", "user_type": "human"},
        )
        if admin_role:
            PermissionChecker.assign_role(project_admin, admin_role, project, granted_by=owner)
        self.stdout.write(f"Test user 1: {project_admin.username} (Project Admin on '{project.name}' only) "
                           f"{'[created]' if created else '[reused]'}")

        other_admin, created2 = User.objects.get_or_create(
            username="test_other_project_admin_ai_model_flow",
            defaults={"email": "test_other_project_admin_ai_model_flow@test.local", "user_type": "human"},
        )
        if admin_role:
            PermissionChecker.assign_role(other_admin, admin_role, other_project, granted_by=owner)
        self.stdout.write(f"Test user 2: {other_admin.username} (Project Admin on '{other_project.name}' only) "
                           f"{'[created]' if created2 else '[reused]'}")

        # ── 1. ai_model.create -- COMPANY scope ONLY ────────────────────────
        self._section("1. CREATE -- ai_model.create (COMPANY scope ONLY -- touches the API key)")
        self._check("owner can ai_model.create", PermissionChecker.can(owner, "ai_model.create", company=company), True)
        self._check("project_admin can ai_model.create -- EXPECT False, no project-scope path for this right",
                     PermissionChecker.can(project_admin, "ai_model.create", company=company), False)

        model = isvc.create_ai_model(company, owner, {
            "name": "Test Model for AI Model Flow", "provider": "litellm", "model_id": "openai/gpt-flow-test",
            "api_key": "sk-fake-flow-test-key", "licence_accepted": True,
        })
        self.stdout.write(f"  -> model created: id={model.id} name={model.name!r} "
                           f"has_api_key={bool(model.api_key_encrypted)}")

        # ── 2. ai_model.list + visibility BEFORE attach ─────────────────────
        self._section("2. LIST (before attach) -- unattached models are invisible to everyone but a company-wide holder")
        self._check("owner can ai_model.list (company-wide)", PermissionChecker.can(owner, "ai_model.list", company=company), True)
        self._check("project_admin can ai_model.list (company-wide)", PermissionChecker.can(project_admin, "ai_model.list", company=company), False)

        owner_sees = [m.name for m in isvc.list_ai_models(company, owner)]
        admin_sees_before = [m.name for m in isvc.list_ai_models(company, project_admin)]
        self.stdout.write(f"  -> owner's list_ai_models: {owner_sees}")
        self.stdout.write(f"  -> project_admin's list_ai_models BEFORE attach "
                           f"(expect [] -- unattached, even though they're a real member of '{project.name}'): {admin_sees_before}")

        # ── 3. ai_model.attach -- PROJECT scope, the deliberate exception ──
        self._section("3. ATTACH -- ai_model.attach (PROJECT scope, obj=project, never touches the key)")
        self._check("owner can ai_model.attach to project", PermissionChecker.can(owner, "ai_model.attach", obj=project), True)
        self._check("project_admin can ai_model.attach to project (own project)", PermissionChecker.can(project_admin, "ai_model.attach", obj=project), True)
        self._check("other_admin can ai_model.attach to project (different project)", PermissionChecker.can(other_admin, "ai_model.attach", obj=project), False)

        attach_result = isvc.attach_ai_model_to_project(company, str(model.id), str(project.id))
        self.stdout.write(f"  -> attach_ai_model_to_project returned: {attach_result}")

        admin_sees_after = [m.name for m in isvc.list_ai_models(company, project_admin)]
        self.stdout.write(f"  -> project_admin's list_ai_models AFTER attach (expect to see it now): {admin_sees_after}")

        # ── 4. ai_model.attach (detach uses the SAME right code) ───────────
        self._section("4. DETACH -- same 'ai_model.attach' right code as step 3, checked identically")
        self._check("owner can detach (ai_model.attach)", PermissionChecker.can(owner, "ai_model.attach", obj=project), True)
        self._check("project_admin can detach (own project)", PermissionChecker.can(project_admin, "ai_model.attach", obj=project), True)
        self._check("other_admin can detach (different project)", PermissionChecker.can(other_admin, "ai_model.attach", obj=project), False)

        detach_result = isvc.detach_ai_model_from_project(company, str(model.id), str(project.id))
        self.stdout.write(f"  -> detach_ai_model_from_project returned: {detach_result}")

        admin_sees_after_detach = [m.name for m in isvc.list_ai_models(company, project_admin)]
        self.stdout.write(f"  -> project_admin's list_ai_models AFTER detach (expect [] again): {admin_sees_after_detach}")

        # ── 5. ai_model.delete -- COMPANY scope ONLY ────────────────────────
        self._section("5. DELETE -- ai_model.delete (COMPANY scope ONLY)")
        self._check("owner can ai_model.delete", PermissionChecker.can(owner, "ai_model.delete", company=company), True)
        self._check("project_admin can ai_model.delete -- EXPECT False", PermissionChecker.can(project_admin, "ai_model.delete", company=company), False)

        delete_result = isvc.delete_ai_model(company, str(model.id))
        self.stdout.write(f"  -> delete_ai_model returned: {delete_result}")
        model.refresh_from_db()
        self.stdout.write(f"  -> model.is_active after delete: {model.is_active}")

        owner_sees_after = [m.name for m in isvc.list_ai_models(company, owner)]
        self.stdout.write(f"  -> owner's list_ai_models after delete (expect gone): {owner_sees_after}")

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
