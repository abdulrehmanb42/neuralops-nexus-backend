"""
authn/permissions/tests.py

Test cases for the permission system, one per use case in USE_CASES.md
(read that first — these tests exist to prove those scenarios actually
behave the way they're described, not to replace it).

Run with:
    python manage.py test authn.permissions

Uses Django's built-in TestCase (matches the rest of this codebase —
see authn/tests.py — no pytest dependency here).
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from nucleus.models import Company, Project, Channel, ChatTopic

from .checker import PermissionChecker
from .models import Right, Role, RoleAssignment, RoleRight
from .rights import DEFAULT_ROLE_RIGHTS, REGISTRY

User = get_user_model()


class RegistryConsistencyTests(TestCase):
    """
    Sanity checks on the plain-Python data in rights.py, with no database
    involved. These would have caught the typo-guard warning that
    seed_permissions prints at runtime, before ever running the command.
    """

    def test_every_default_role_right_exists_in_registry(self):
        known_codes = {code for code, *_ in REGISTRY}
        for role_name, right_codes in DEFAULT_ROLE_RIGHTS.items():
            for code in right_codes:
                self.assertIn(
                    code, known_codes,
                    f"DEFAULT_ROLE_RIGHTS['{role_name}'] references '{code}', "
                    f"which is not in REGISTRY.",
                )

    def test_registry_codes_are_unique(self):
        codes = [code for code, *_ in REGISTRY]
        self.assertEqual(len(codes), len(set(codes)), "Duplicate right code in REGISTRY.")

    def test_company_wide_ai_rights_excluded_from_member_and_viewer(self):
        """
        Locks in the decision from the design discussion: persona/agent/
        mcp_server/ai_model create+delete rights must never be handed to
        Member or Viewer by default, regardless of scope.
        """
        forbidden_prefixes = ("persona.create", "persona.update", "persona.delete",
                               "agent.create", "agent.delete",
                               "mcp_server.create", "mcp_server.delete",
                               "ai_model.create", "ai_model.delete")
        for role_name in ("Member", "Viewer"):
            granted = set(DEFAULT_ROLE_RIGHTS[role_name])
            overlap = granted.intersection(forbidden_prefixes)
            self.assertFalse(
                overlap,
                f"{role_name} must not hold company-wide infra rights, found: {overlap}",
            )


class PermissionCheckerTestCase(TestCase):
    """
    Base fixture shared by the behavioural tests below: one company, one
    project, one channel, two topics, three users, and just the Right /
    Role / RoleRight rows the tests actually need (not the full registry
    — keeps each test's intent readable without a database round trip
    through the management command).
    """

    def setUp(self):
        self.company = Company.objects.create(name="Acme", slug="acme")

        self.owner = User.objects.create_user(username="noaman", email="noaman@acme.test", password="x")
        self.company.owner = self.owner
        self.company.save(update_fields=["owner"])

        self.sara = User.objects.create_user(username="sara", email="sara@acme.test", password="x")
        self.ali = User.objects.create_user(username="ali", email="ali@acme.test", password="x")

        self.project = Project.objects.create(company=self.company, name="Q3 Launch", slug="q3-launch")
        self.channel = Channel.objects.create(
            company=self.company, project=self.project, name="general", slug="general",
        )
        self.topic_a = ChatTopic.objects.create(
            company=self.company, project=self.project, channel=self.channel,
            title="Topic A", slug="topic-a",
        )
        self.topic_b = ChatTopic.objects.create(
            company=self.company, project=self.project, channel=self.channel,
            title="Topic B", slug="topic-b",
        )

        # Only the rights these tests exercise -- not the full REGISTRY.
        self.r_project_create = Right.objects.create(code="project.create", object_type="project", scope="company")
        self.r_channel_create = Right.objects.create(code="channel.create", object_type="channel", scope="project")
        self.r_topic_mark_read = Right.objects.create(code="topic.mark_read", object_type="topic", scope="topic")
        self.r_persona_create = Right.objects.create(code="persona.create", object_type="persona", scope="company")
        self.r_persona_mention = Right.objects.create(code="persona.mention", object_type="persona", scope="topic")

        self.role_company_admin = Role.objects.create(
            company=self.company, name="Admin", scope="company", description="Company-wide admin.",
        )
        for right in (self.r_project_create, self.r_channel_create, self.r_topic_mark_read,
                      self.r_persona_create, self.r_persona_mention):
            RoleRight.objects.create(role=self.role_company_admin, right=right)

        self.role_project_admin = Role.objects.create(
            company=self.company, name="Admin", scope="project", description="Project-scoped admin.",
        )
        for right in (self.r_channel_create, self.r_topic_mark_read, self.r_persona_mention):
            RoleRight.objects.create(role=self.role_project_admin, right=right)
        # Deliberately NOT granted persona.create at project scope -- see UC6.

        self.role_topic_member = Role.objects.create(
            company=self.company, name="Member", scope="topic", description="Topic-scoped member.",
        )
        RoleRight.objects.create(role=self.role_topic_member, right=self.r_topic_mark_read)
        RoleRight.objects.create(role=self.role_topic_member, right=self.r_persona_mention)


class UC1_CreateProjectTests(PermissionCheckerTestCase):
    """UC1 -- creating a project is a Company-scope right, checked before any Project exists."""

    def test_company_admin_can_create_project(self):
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertTrue(
            PermissionChecker.can(self.sara, "project.create", company=self.company)
        )

    def test_user_with_no_assignment_cannot_create_project(self):
        self.assertFalse(
            PermissionChecker.can(self.ali, "project.create", company=self.company)
        )


class UC3_ProjectAdminCreatesChannelTests(PermissionCheckerTestCase):
    """UC3 -- a Project-scoped assignment reaches down to grant channel.create on that project."""

    def test_project_scoped_admin_can_create_channel_on_own_project(self):
        PermissionChecker.assign_role(self.sara, self.role_project_admin, self.project)
        self.assertTrue(
            PermissionChecker.can(self.sara, "channel.create", obj=self.project)
        )

    def test_project_scoped_admin_cannot_act_on_a_different_project(self):
        other_project = Project.objects.create(company=self.company, name="Other", slug="other")
        PermissionChecker.assign_role(self.sara, self.role_project_admin, self.project)
        self.assertFalse(
            PermissionChecker.can(self.sara, "channel.create", obj=other_project)
        )


class UC4_TopicScopedMemberVisibilityTests(PermissionCheckerTestCase):
    """UC4 -- a Topic-scoped assignment reaches only that topic, not sibling topics."""

    def test_topic_member_has_rights_on_own_topic(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        self.assertTrue(
            PermissionChecker.can(self.ali, "topic.mark_read", obj=self.topic_a)
        )

    def test_topic_member_has_no_rights_on_sibling_topic(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        self.assertFalse(
            PermissionChecker.can(self.ali, "topic.mark_read", obj=self.topic_b)
        )


class UC5_PromotionIsAdditiveTests(PermissionCheckerTestCase):
    """UC5 -- promoting to a broader scope doesn't remove the narrower assignment, and both apply."""

    def test_promoting_to_project_admin_grants_full_project_reach(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        PermissionChecker.assign_role(self.ali, self.role_project_admin, self.project)

        # Now reaches topic_b too, even though the original assignment was only on topic_a.
        self.assertTrue(
            PermissionChecker.can(self.ali, "topic.mark_read", obj=self.topic_b)
        )
        # The original narrower assignment still exists and still works.
        self.assertTrue(
            PermissionChecker.can(self.ali, "topic.mark_read", obj=self.topic_a)
        )
        self.assertEqual(RoleAssignment.objects.filter(user=self.ali).count(), 2)


class UC6_UC7_CompanyWideRightsScopeTests(PermissionCheckerTestCase):
    """UC6/UC7 -- persona.create is COMPANY scope only; a Project-scoped Admin must not inherit it."""

    def test_project_scoped_admin_cannot_create_persona(self):
        PermissionChecker.assign_role(self.ali, self.role_project_admin, self.project)
        self.assertFalse(
            PermissionChecker.can(self.ali, "persona.create", company=self.company)
        )

    def test_company_scoped_admin_can_create_persona(self):
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertTrue(
            PermissionChecker.can(self.sara, "persona.create", company=self.company)
        )


class UC8_StackedCapabilityRoleTests(PermissionCheckerTestCase):
    """UC8 -- a small additive role grants exactly one extra right, without a full promotion."""

    def test_stacked_capability_role_grants_only_its_own_rights(self):
        builder_role = Role.objects.create(
            company=self.company, name="Persona Builder", scope="company",
            description="Can create personas only.",
        )
        RoleRight.objects.create(role=builder_role, right=self.r_persona_create)

        PermissionChecker.assign_role(self.ali, self.role_project_admin, self.project)  # base tier
        PermissionChecker.assign_role(self.ali, builder_role, self.company)  # stacked capability

        self.assertTrue(
            PermissionChecker.can(self.ali, "persona.create", company=self.company),
            "Stacked capability role should grant persona.create.",
        )
        self.assertFalse(
            PermissionChecker.can(self.ali, "project.create", company=self.company),
            "Builder role must not also grant unrelated rights like project.create.",
        )


class UC10_ViewerCannotMentionTests(PermissionCheckerTestCase):
    """UC10 -- a role that never grants persona.mention correctly denies AI triggering."""

    def test_role_without_mention_right_is_denied(self):
        read_only_role = Role.objects.create(
            company=self.company, name="Viewer", scope="topic", description="Read-only.",
        )
        RoleRight.objects.create(role=read_only_role, right=self.r_topic_mark_read)
        # Deliberately no persona.mention grant.

        PermissionChecker.assign_role(self.ali, read_only_role, self.topic_a)

        self.assertTrue(PermissionChecker.can(self.ali, "topic.mark_read", obj=self.topic_a))
        self.assertFalse(PermissionChecker.can(self.ali, "persona.mention", obj=self.topic_a))


class UC12_RightsForTests(PermissionCheckerTestCase):
    """UC12 -- rights_for() returns the full union in one call, for a frontend permissions payload."""

    def test_rights_for_returns_union_of_all_applicable_roles(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        rights = PermissionChecker.rights_for(self.ali, obj=self.topic_a)
        self.assertEqual(rights, {"topic.mark_read", "persona.mention"})

    def test_rights_for_returns_empty_set_with_no_assignment(self):
        rights = PermissionChecker.rights_for(self.ali, obj=self.topic_a)
        self.assertEqual(rights, set())


class EdgeCaseTests(PermissionCheckerTestCase):
    """Things that don't map to a single use case above, but matter for correctness."""

    def test_unauthenticated_user_is_always_denied(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(
            PermissionChecker.can(AnonymousUser(), "project.create", company=self.company)
        )

    def test_unknown_right_code_raises_value_error(self):
        with self.assertRaises(ValueError):
            PermissionChecker.can(self.owner, "not.a.real.right", company=self.company)

    def test_assign_role_is_idempotent(self):
        """Assigning the same role to the same user/scope twice does not create a duplicate row."""
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertEqual(
            RoleAssignment.objects.filter(user=self.sara, role=self.role_company_admin).count(), 1,
        )

    def test_revoke_role_removes_the_assignment(self):
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertTrue(PermissionChecker.can(self.sara, "project.create", company=self.company))

        deleted = PermissionChecker.revoke_role(self.sara, self.role_company_admin, self.company)
        self.assertEqual(deleted, 1)
        self.assertFalse(PermissionChecker.can(self.sara, "project.create", company=self.company))


class UC2_ListVsViewTests(PermissionCheckerTestCase):
    """
    UC2 -- listing the projects a user can see. can() answers "may this
    user act on THIS ONE object" -- it does not, by itself, return a
    filtered list. These tests show what it DOES answer, which is what
    the actual list_projects query needs to branch on: does the user
    hold a company-wide 'project.list' right (see everything), or only
    'project.view' on specific projects they're individually scoped to
    (see just those).
    """

    def setUp(self):
        super().setUp()
        self.r_project_list = Right.objects.create(code="project.list", object_type="project", scope="company")
        self.r_project_view = Right.objects.create(code="project.view", object_type="project", scope="project")
        RoleRight.objects.create(role=self.role_company_admin, right=self.r_project_list)
        RoleRight.objects.create(role=self.role_company_admin, right=self.r_project_view)
        RoleRight.objects.create(role=self.role_project_admin, right=self.r_project_view)

    def test_company_scoped_admin_can_list_company_wide(self):
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertTrue(
            PermissionChecker.can(self.sara, "project.list", company=self.company),
            "Company-scoped Admin should see every project in the company, not just ones they're added to.",
        )

    def test_project_scoped_admin_cannot_list_company_wide_but_can_view_their_own(self):
        PermissionChecker.assign_role(self.ali, self.role_project_admin, self.project)
        self.assertFalse(
            PermissionChecker.can(self.ali, "project.list", company=self.company),
            "A user scoped to one project has no company-wide list right -- "
            "the actual query must fall back to their individual RoleAssignments.",
        )
        self.assertTrue(
            PermissionChecker.can(self.ali, "project.view", obj=self.project),
            "But they can still view the one project they hold a direct assignment on.",
        )
        other_project = Project.objects.create(company=self.company, name="Other", slug="other-uc2")
        self.assertFalse(
            PermissionChecker.can(self.ali, "project.view", obj=other_project),
            "And correctly cannot view a project they were never added to.",
        )


class UC9_SessionCreateCloseTests(PermissionCheckerTestCase):
    """UC9 -- a Topic Member can open and close an AI session in their own topic, and only that one."""

    def setUp(self):
        super().setUp()
        self.r_session_create = Right.objects.create(code="session.create", object_type="session", scope="topic")
        self.r_session_close = Right.objects.create(code="session.close", object_type="session", scope="topic")
        RoleRight.objects.create(role=self.role_topic_member, right=self.r_session_create)
        RoleRight.objects.create(role=self.role_topic_member, right=self.r_session_close)

    def test_topic_member_can_open_and_close_session_on_own_topic(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        self.assertTrue(PermissionChecker.can(self.ali, "session.create", obj=self.topic_a))
        self.assertTrue(PermissionChecker.can(self.ali, "session.close", obj=self.topic_a))

    def test_topic_member_cannot_open_session_on_a_topic_they_are_not_in(self):
        PermissionChecker.assign_role(self.ali, self.role_topic_member, self.topic_a)
        self.assertFalse(PermissionChecker.can(self.ali, "session.create", obj=self.topic_b))

    def test_project_scoped_admin_can_open_session_on_any_topic_in_their_project(self):
        # channel_create/topic_mark_read/persona_mention were granted to role_project_admin
        # in the base fixture, but not session rights -- grant them here to prove reach,
        # not default content.
        RoleRight.objects.create(role=self.role_project_admin, right=self.r_session_create)
        PermissionChecker.assign_role(self.sara, self.role_project_admin, self.project)
        self.assertTrue(PermissionChecker.can(self.sara, "session.create", obj=self.topic_a))
        self.assertTrue(PermissionChecker.can(self.sara, "session.create", obj=self.topic_b))


class UC11_ProjectDeleteTests(PermissionCheckerTestCase):
    """
    UC11 -- deleting a project is Owner-tier. Written against the
    CURRENT code, not the still-open question from ROLE_STORIES.md
    review: since "no Project Owner" was decided in the docs but not
    yet enforced anywhere in code, a Role named "Owner" assigned at
    PROJECT scope would still work today (project.delete's scope tag in
    rights.py is ScopeType.PROJECT, which permits a project-scoped
    assignment to hold it) -- see the last test below, which documents
    that gap on purpose rather than hiding it.
    """

    def setUp(self):
        super().setUp()
        self.r_project_delete = Right.objects.create(code="project.delete", object_type="project", scope="project")
        RoleRight.objects.create(role=self.role_company_admin, right=self.r_project_delete)
        # Mirrors rights.py: Admin's DEFAULT_ROLE_RIGHTS deliberately excludes project.delete.
        # role_company_admin here stands in for "Owner" for this test's purposes since the
        # shared fixture doesn't define a separate Owner Role -- see note below.

    def test_company_scoped_role_with_the_right_can_delete(self):
        PermissionChecker.assign_role(self.sara, self.role_company_admin, self.company)
        self.assertTrue(PermissionChecker.can(self.sara, "project.delete", obj=self.project))

    def test_project_admin_cannot_delete_by_default(self):
        PermissionChecker.assign_role(self.ali, self.role_project_admin, self.project)
        self.assertFalse(
            PermissionChecker.can(self.ali, "project.delete", obj=self.project),
            "role_project_admin was never granted project.delete in the base fixture, matching "
            "DEFAULT_ROLE_RIGHTS['Admin'] in rights.py, which excludes it on purpose.",
        )

    def test_KNOWN_GAP_a_project_scoped_assignment_can_still_be_granted_delete(self):
        """
        Documents a real gap, doesn't assert it's correct behaviour.

        ROLE_STORIES.md review concluded "no Project Owner should exist" --
        but nothing in the schema or PermissionChecker stops a company from
        creating a Role called anything (including "Owner") at PROJECT
        scope and granting it project.delete, because project.delete's
        scope tag is ScopeType.PROJECT (same-or-broader reaches it), not
        ScopeType.COMPANY. If "no Project Owner" needs to be a hard rule
        rather than a naming convention, project.delete's scope tag should
        move to ScopeType.COMPANY in rights.py, which would make this test
        fail (correctly) until fixed.
        """
        rogue_role = Role.objects.create(
            company=self.company, name="Owner", scope="project",
            description="Should not be possible to create per ROLE_STORIES.md, but nothing stops it today.",
        )
        RoleRight.objects.create(role=rogue_role, right=self.r_project_delete)
        PermissionChecker.assign_role(self.ali, rogue_role, self.project)

        self.assertTrue(
            PermissionChecker.can(self.ali, "project.delete", obj=self.project),
            "This currently succeeds -- flagging for a decision, not asserting it's desired.",
        )
