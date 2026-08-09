"""
authn.permissions — the single permission system for NeuralOps.

Everything that decides "can this user do X" lives in this package, and
NOWHERE else. Before this package existed, permission logic was scattered
across three unrelated mechanisms:

    1. Django's built-in model-level permissions (user.has_perm("nucleus.add_project"))
    2. Manual role checks against CompanyAccess.role / ProjectMember.role / TopicParticipant.role
    3. django-guardian, installed but never actually wired to anything

This package replaces all three with one flow:

    Right           — the full list of things that can be done in the system
                       (e.g. "project.create", "session.open", "persona.mention")

    Role            — a named, philosophy-driven bundle of Rights
                       (e.g. Owner, Admin, Member, Viewer, or a company's own
                       custom role like "Builder")

    RoleRight       — which Rights belong to which Role (the rights matrix)

    RoleAssignment  — which user holds which Role, scoped to a specific object
                       (a Company, a Project, or a ChatTopic). A user can hold
                       MULTIPLE RoleAssignments at the same scope at once —
                       effective rights are the UNION of every role they hold
                       that reaches the object being checked.

    PermissionChecker — the one function every view/service calls:
                       PermissionChecker.can(user, "project.create", obj=project)

See rights.py for the full Right registry, models.py for the four tables,
and checker.py for how a check is actually resolved.
"""
