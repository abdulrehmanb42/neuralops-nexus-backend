"""
python manage.py test_agent_persona_flow [--agent-only | --persona-only]

Closes out #111/#112 -- exercises the AIAgent and Persona CRUD methods that
never got the same full pass the other resource types (Project, Channel,
Topic, AIModel, MCPServer) got during the earlier manual shell walkthrough.

Owner-level CRUD only for this first pass -- proving the service methods
themselves work correctly. Row-visibility (visible_agents/visible_personas
for a narrower-permissioned user) is a separate, bigger test that needs its
own fixture user + RoleAssignment setup -- left for later, not part of this.

Safe to re-run: both create_agent()/create_persona()'s uniqueness checks are
scoped to is_active=True, and this command's own delete step soft-deletes
what it created, so the same test name is free again on the next run (as
long as a run completes -- a run that fails partway leaves the name taken).
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from intelligence import services as isvc
from nucleus.models import AIModel, Company
from workspace import services as wsvc

User = get_user_model()

_AGENT_NAME = "AgentFlowTest"
_PERSONA_NAME = "PersonaFlowTest"


class Command(BaseCommand):
    help = "Exercise AIAgent and Persona CRUD methods end-to-end (#111/#112)."

    def add_arguments(self, parser):
        parser.add_argument("--agent-only", action="store_true", help="Only run the Agent CRUD test.")
        parser.add_argument("--persona-only", action="store_true", help="Only run the Persona CRUD test.")

    def handle(self, *args, **options):
        run_all = not any([options["agent_only"], options["persona_only"]])

        if run_all or options["agent_only"]:
            self._section("Agent CRUD")
            self.test_agent_crud()

        if run_all or options["persona_only"]:
            self._section("Persona CRUD")
            self.test_persona_crud()

    def _section(self, title):
        self.stdout.write("=" * 60)
        self.stdout.write(self.style.NOTICE(title))
        self.stdout.write("=" * 60)

    # ── Fixtures -- fetched, not recreated, so this is safe to re-run ─────────

    def get_fixtures(self):
        company = Company.objects.first()
        if not company:
            raise RuntimeError("No Company exists yet -- nothing to test against.")
        owner = company.owner
        project = wsvc.list_projects(company, owner).first()
        if not project:
            raise RuntimeError("No Project exists yet -- create one first.")
        return company, owner, project

    def get_test_model(self, company):
        """Any AIModel will do here -- CRUD tests don't make real LLM calls,
        so a fake model_id/no API key is fine, unlike test_chat_flow's."""
        model = AIModel.objects.filter(company=company, is_active=True).first()
        if not model:
            raise RuntimeError("No AIModel exists on this company -- create one first.")
        return model

    # ── Agent ────────────────────────────────────────────────────────────────

    def test_agent_crud(self):
        from nucleus.models import AIAgent

        company, owner, project = self.get_fixtures()
        model = self.get_test_model(company)

        # Clean up a leftover from a previous failed run, if any.
        AIAgent.objects.filter(company=company, name=_AGENT_NAME, projects=project).delete()

        agent = isvc.create_agent(company, {
            "name": _AGENT_NAME,
            "agent_type": "internal",
            "model_id": str(model.id),
            "project_id": str(project.id),
        })
        self.stdout.write(f"create_agent: {agent.id} ({agent.name}, model={agent.model.name})")

        listed = list(isvc.list_agents(company, owner))
        found = any(a.id == agent.id for a in listed)
        self.stdout.write(f"list_agents: {len(listed)} agents, created one present={found}")

        fetched = isvc.get_agent(company, str(agent.id))
        self.stdout.write(f"get_agent: {'OK' if fetched and fetched.id == agent.id else 'FAILED'}")

        updated = isvc.update_agent(company, str(agent.id), {"max_steps": 9})
        self.stdout.write(f"update_agent: max_steps={updated.max_steps} ({'OK' if updated.max_steps == 9 else 'FAILED'})")

        deleted = isvc.delete_agent(company, str(agent.id))
        still_listed = any(a.id == agent.id for a in isvc.list_agents(company, owner))
        self.stdout.write(
            f"delete_agent: deleted={deleted}, still in list_agents={still_listed} "
            f"({'OK' if deleted and not still_listed else 'FAILED'})"
        )

    # ── Persona ──────────────────────────────────────────────────────────────

    def test_persona_crud(self):
        from nucleus.models import Persona

        company, owner, project = self.get_fixtures()
        model = self.get_test_model(company)

        # Clean up a leftover from a previous failed run, if any (including
        # its shadow user, since create_persona() will make a fresh one).
        stale = Persona.objects.filter(project=project, name=_PERSONA_NAME).select_related("identity_user").first()
        if stale:
            if stale.identity_user:
                stale.identity_user.delete()
            stale.delete()

        persona = isvc.create_persona(company, owner, {
            "name": _PERSONA_NAME,
            "source_type": "model",
            "model_id": str(model.id),
            "project_id": str(project.id),
            "prompt": {"system_prompt": "Test persona for #111/#112 CRUD verification."},
        })
        self.stdout.write(f"create_persona: {persona.id} ({persona.name}, model={persona.model.name})")

        listed = list(isvc.list_personas(project, owner))
        found = any(p.id == persona.id for p in listed)
        self.stdout.write(f"list_personas: {len(listed)} personas, created one present={found}")

        fetched = isvc.get_persona(company, str(persona.id))
        self.stdout.write(f"get_persona: {'OK' if fetched and fetched.id == persona.id else 'FAILED'}")

        patched = isvc.patch_persona(company, str(persona.id), {
            "description": "patched by test_agent_persona_flow",
            "prompt": {"system_prompt": "Updated system prompt."},
        })
        ok = (
            patched.description == "patched by test_agent_persona_flow"
            and patched.prompt.system_prompt == "Updated system prompt."
        )
        self.stdout.write(f"patch_persona: description+prompt updated ({'OK' if ok else 'FAILED'})")

        shadow_user_id = persona.identity_user_id
        deleted = isvc.delete_persona(company, str(persona.id))
        shadow_user = User.objects.filter(id=shadow_user_id).first()
        still_listed = any(p.id == persona.id for p in isvc.list_personas(project, owner))
        self.stdout.write(
            f"delete_persona: deleted={deleted}, shadow_user.is_active={shadow_user.is_active if shadow_user else None}, "
            f"still in list_personas={still_listed} "
            f"({'OK' if deleted and shadow_user and not shadow_user.is_active and not still_listed else 'FAILED'})"
        )
