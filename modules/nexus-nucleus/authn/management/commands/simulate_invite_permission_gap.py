"""
Management command: python manage.py simulate_invite_permission_gap

DIAGNOSTIC ONLY -- proves the P0 finding (#120 in CHAT_REVAMP_STRATEGY.md),
does not fix anything. Two parts:

  PART 1 -- Uses the REAL invite_to_project() function (the actual code
  behind the /invite slash command) to invite a fresh user to exactly one
  topic. Then shows she has zero RoleAssignment rows despite being
  "invited," so PermissionChecker.can() denies her everywhere, including
  the one topic she was invited to.

  PART 2 -- Manually grants her a topic-scoped RoleAssignment directly
  (simulating what invite_to_project() SHOULD do after the invite-flow
  fix), to isolate the second, smaller bug on top: get_project() still
  can't see a topic-only assignment even once one exists.

Safe to re-run: fixtures use get_or_create.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authn.permissions.checker import PermissionChecker
from authn.permissions.models import Role, RoleAssignment
from workspace import services as wsvc
from nucleus.models import Company, ProjectMember, TopicParticipant

User = get_user_model()


class Command(BaseCommand):
    help = "Simulate and prove the invite -> RoleAssignment gap (#120). Diagnostic only, no fix applied."

    def handle(self, *args, **options):
        self._line()
        self.stdout.write(self.style.NOTICE("Simulating the #120 permission gap"))
        self._line()

        company = Company.objects.filter(is_active=True).first()
        if not company:
            self.stdout.write(self.style.ERROR("No company found -- run 'manage.py create_owner' first."))
            return
        owner = company.owner
        self.stdout.write(f"Company: {company.name} | Owner: {owner.email}")

        member_role = Role.objects.filter(company=company, name="Member").first()
        if not member_role:
            self.stdout.write(self.style.ERROR("No 'Member' role found -- run 'manage.py seed_permissions' first."))
            return

        # ── Fixtures: a fresh project + topic, and a fresh invitee ─────────────
        project = wsvc.create_project(
            company=company, user=owner,
            name="Invite Gap Simulation Project",
            description="Fixture for simulate_invite_permission_gap.",
        )
        channel = project.channel_items.first()  # auto-created "general" channel
        topic = wsvc.create_topic(company=company, project=project, channel=channel,
                                   title="Homepage feedback", creator=owner)
        self.stdout.write(f"  -> project={project.name!r} channel={channel.name!r} topic={topic.title!r}")

        sarah, _ = User.objects.get_or_create(
            username="test_sarah_invite_gap",
            defaults={"email": "sarah_invite_gap@test.local", "user_type": "human"},
        )
        # Clean slate for a re-run: drop anything a previous run of this command created
        RoleAssignment.objects.filter(user=sarah).delete()
        ProjectMember.objects.filter(user=sarah, project=project).delete()
        TopicParticipant.objects.filter(user=sarah, topic=topic).delete()
        self.stdout.write(f"  -> invitee: {sarah.email} (clean slate)")

        # ── PART 1 -- the REAL invite flow ──────────────────────────────────────
        self._section("PART 1 -- Using the actual invite_to_project() -- scope='topic'")

        result = wsvc.invite_to_project(
            company=company, inviter=owner, project=project,
            email=sarah.email, scope="topic", topic_id=str(topic.id), role="member",
        )
        self.stdout.write(f"  invite_to_project() returned: {result}")

        has_project_member = ProjectMember.objects.filter(company=company, project=project, user=sarah).exists()
        has_topic_participant = TopicParticipant.objects.filter(company=company, topic=topic, user=sarah).exists()
        has_role_assignment = RoleAssignment.objects.filter(user=sarah).exists()

        self._check("She got a ProjectMember row (legacy system)", has_project_member, True)
        self._check("She got a TopicParticipant row (legacy system)", has_topic_participant, True)
        self._check("She got a RoleAssignment row (the ACTUAL RBAC system) -- THIS IS THE BUG",
                     has_role_assignment, True)

        can_mark_read = PermissionChecker.can(sarah, "topic.mark_read", obj=topic)
        self._check("She can PermissionChecker.can('topic.mark_read') on the topic she was JUST invited to",
                     can_mark_read, True)

        her_projects = [p.name for p in wsvc.list_projects(company, sarah)]
        self.stdout.write(f"  -> her list_projects() right now: {her_projects} (expect empty -- she's invisible)")

        self.stdout.write(self.style.WARNING(
            "\n  Conclusion so far: invite_to_project() ran successfully, returned ok=True, \n"
            "  she has legacy membership rows -- but she holds NO real permission at all.\n"
            "  Every PermissionChecker.can() check for her returns False, and she doesn't\n"
            "  even show up in her own project list."
        ))

        # ── PART 2 -- simulate the invite-flow fix, isolate the SECOND bug ─────
        self._section("PART 2 -- Now grant her the RoleAssignment invite_to_project() SHOULD have granted")

        PermissionChecker.assign_role(sarah, member_role, topic, granted_by=owner)
        self.stdout.write("  -> PermissionChecker.assign_role(sarah, member_role, topic, granted_by=owner) called directly")

        her_projects_after = [p.name for p in wsvc.list_projects(company, sarah)]
        self._check("PATH A -- she now appears in list_projects() (visible_projects -> _reachable_project_ids)",
                     project.name in her_projects_after, True)

        can_view_direct = PermissionChecker.can(sarah, "project.view", obj=project)
        self._check("PermissionChecker.can('project.view', obj=project) directly", can_view_direct, False)

        fetched = wsvc.get_project(company, sarah, str(project.id))
        self._check("PATH B -- but get_project() (used by _resolve_topic_sync/_resolve_project) still finds it -- EXPECT FAIL",
                     fetched is not None, True)

        self.stdout.write(self.style.WARNING(
            "\n  Conclusion: even with the RoleAssignment in place, she shows up in her own\n"
            "  sidebar (PATH A) but get_project() still returns None (PATH B) -- so opening\n"
            "  the project, or hitting any endpoint that resolves through _resolve_topic_sync\n"
            "  / _resolve_project, still 404s her. This is the second, smaller bug layered on\n"
            "  top of the first."
        ))

        self._line()
        self.stdout.write(self.style.SUCCESS("Done. Both halves of #120 reproduced. No fix applied."))

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
