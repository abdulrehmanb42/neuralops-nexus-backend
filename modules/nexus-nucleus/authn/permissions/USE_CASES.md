# Permission system — use cases

Plain-language scenarios first, each with the actual `PermissionChecker`
call it maps to. This is meant to be read start to finish once, so you
can see how the same four calls (`can`, `rights_for`, `assign_role`,
`revoke_role`) cover every case that came up while designing this.

None of the `api.py` files listed below have actually been changed yet —
these are the intended call sites, shown so you can see where this
plugs in once you're ready to wire it up.

---

## UC1 — Creating a project

Noaman is Company Admin. He wants to create a new project called "Q3 Launch".

There's no `Project` row yet, so the check is made against the `Company`,
not an object:

```python
# workspace/api.py -> create_project view
if not PermissionChecker.can(request.auth, "project.create", company=company):
    raise HttpError(403, "You don't have permission to create projects.")
```

`project.create` has `scope=COMPANY` (see `rights.py`), so only a
Company-scoped `RoleAssignment` grants it — a Project-scoped one
wouldn't even be found, since there's no project to be scoped to yet.

---

## UC2 — Listing the projects you can see

Sara is Member on "Q3 Launch" only, not Company-wide. She opens the
project list.

```python
# workspace/services.py -> list_projects
visible_project_ids = [
    a.scope_object_id for a in RoleAssignment.objects.filter(
        user=user, scope_object_type="project",
    )
] + [company-wide project ids, if the user holds a company-scoped assignment with project.list]
```

`rights_for(user, company=company)` tells you *whether* `project.list`
is held company-wide; the actual filtered queryset still needs the
per-project `RoleAssignment` rows for anyone scoped narrower than the
company. This is the one case where `can()` alone isn't enough — you're
not asking "can they see one project," you're asking "which ones." Keep
the existing `list_projects` query shape (role-aware filter), just swap
what decides "is this an admin-equivalent" from `CompanyAccess.role`
to `PermissionChecker.can(user, "project.list", company=company)`.

---

## UC3 — Project Admin creates a channel

Sara is promoted to Admin on "Q3 Launch" (Project-scoped, not
Company-scoped). She creates a new channel called "Marketing".

```python
# workspace/api.py -> create_channel view
if not PermissionChecker.can(request.auth, "channel.create", obj=project):
    raise HttpError(403, "You don't have permission to create channels.")
```

`channel.create` has `scope=PROJECT`. Sara's `RoleAssignment` is
anchored directly at this `Project`, so `_scope_chain(project)` finds
it immediately — no need for her to also hold anything at Company scope.

---

## UC4 — Inviting someone as Member of one Topic only

Sara invites Ali to help with a specific conversation, not the whole
project. He's added as Member scoped to that one `ChatTopic`.

```python
role = Role.objects.get(company=company, name="Member")
PermissionChecker.assign_role(ali, role, topic, granted_by=sara)
```

Ali now has `topic.mark_read`, `session.create`, `persona.mention` —
but only reachable through that one `ChatTopic`. Ask
`PermissionChecker.can(ali, "topic.list", obj=some_other_topic)` and it
returns `False`: his only `RoleAssignment` is anchored at the first
topic, and `_scope_chain(some_other_topic)` never includes it. This is
"can't see other topics until added," exactly as discussed.

---

## UC5 — Promoting Ali to Project Admin instead

Sara decides Ali should see the whole project, not just one topic.

```python
project_admin_role = Role.objects.get(company=company, name="Admin")
PermissionChecker.assign_role(ali, project_admin_role, project, granted_by=sara)
```

This doesn't remove his earlier Topic-scoped Member assignment — it's
additive. Ali now holds two `RoleAssignment` rows. It doesn't matter:
his effective rights on any topic under "Q3 Launch" are now the union
of both, and the Project-scoped Admin assignment alone already reaches
every topic in the project, making the narrower one redundant (harmless
to leave, or you can `revoke_role` it for tidiness).

---

## UC6 — A Member tries to create a Persona (denied)

Ali (Project-scoped Admin, not Company-scoped anything) tries to
register a new Persona for the whole company.

```python
# intelligence/api.py -> create_persona view
if not PermissionChecker.can(request.auth, "persona.create", company=company):
    raise HttpError(403, "You don't have permission to create personas.")
```

`persona.create` has `scope=COMPANY`. Ali's only assignment is at
`PROJECT` scope — `_scope_chain` for a `company` argument is just
`[(COMPANY, company.id)]`, and `_matching_assignments` only considers
assignments anchored at COMPANY or broader when the right itself is
COMPANY-scoped. His Project-scoped Admin role never enters the
comparison. Correctly denied, matching "AI infrastructure creation is
Admin/Owner-only, and only at Company scope."

---

## UC7 — Company Admin creates that same Persona (allowed)

Noaman (Company-scoped Admin) makes the same request.

Same check as UC6, but this time `_matching_assignments` finds his
Company-scoped `RoleAssignment`, and `RoleRight` confirms Admin includes
`persona.create` (see `DEFAULT_ROLE_RIGHTS` in `rights.py`) — allowed.

---

## UC8 — Stacking a capability role instead of promoting someone fully

Noaman wants Ali to be able to create Personas for the company, but
doesn't want to make him a full Company Admin (which would also give
him `company.remove_member`, `project.delete`, etc. — too much).

```python
builder_role, _ = Role.objects.get_or_create(
    company=company, name="Persona Builder", scope="company",
    defaults={"description": "Can create/manage personas only. No membership or project rights."},
)
persona_rights = Right.objects.filter(code__in=["persona.create", "persona.update", "persona.delete"])
for right in persona_rights:
    RoleRight.objects.get_or_create(role=builder_role, right=right)

PermissionChecker.assign_role(ali, builder_role, company)
```

Ali now holds Project Admin (on "Q3 Launch") *and* "Persona Builder"
(company-wide) at the same time — two separate, small, honest grants
instead of one bloated role. `PermissionChecker.can(ali, "persona.create", company=company)`
now returns `True`, while `PermissionChecker.can(ali, "company.remove_member", company=company)`
still returns `False`. This is the "no role-copying, just stack a small
additive role" pattern from the design discussion.

---

## UC9 — Opening and closing an AI session

Ali (topic Member) sends `@Nova @session` in a topic.

```python
# chat/api.py -> send_message view, before opening the session
if not PermissionChecker.can(request.auth, "session.create", obj=topic):
    raise HttpError(403, "You don't have permission to open a session here.")
```

Later, `@session close`:

```python
if not PermissionChecker.can(request.auth, "session.close", obj=topic):
    raise HttpError(403, "You don't have permission to close this session.")
```

Both are `scope=TOPIC`, granted by Member (see `DEFAULT_ROLE_RIGHTS`),
not by Viewer.

---

## UC10 — Viewer tries to mention a persona (denied)

A Viewer-role user sends `@Nova what's the status?` in a topic they can
read.

```python
if not PermissionChecker.can(request.auth, "persona.mention", obj=topic):
    raise HttpError(403, "You don't have permission to trigger AI in this topic.")
```

Viewer's `DEFAULT_ROLE_RIGHTS` deliberately excludes `persona.mention`
— they can read, not act. `chat/api.py` would call this right before
firing `trigger_ai_response_async`, so a Viewer's `@mention` is silently
ignored (or shown as text-only) instead of triggering a real AI call.

---

## UC11 — Owner deletes a project (irreversible action)

Noaman, Owner of "Q3 Launch", deletes it.

```python
# workspace/api.py -> delete_project view
if not PermissionChecker.can(request.auth, "project.delete", obj=project):
    raise HttpError(403, "You don't have permission to delete this project.")
```

`project.delete` is intentionally left out of `DEFAULT_ROLE_RIGHTS["Admin"]`
— only Owner (and whatever custom role a company chooses to grant it
to) can do this. An Admin, even a Company-scoped one, gets a 403.

---

## UC12 — Building a frontend permissions payload in one call

The React app opens a project page and wants to know upfront which
buttons to show (Create Channel? Delete Project? Invite?) without
firing a `can()` call per button.

```python
# workspace/api.py, or a small dedicated endpoint
rights = PermissionChecker.rights_for(request.auth, obj=project)
# -> {"project.view", "channel.create", "topic.create", "session.create", ...}
return {"rights": sorted(rights)}
```

One query pattern, the frontend just checks `"channel.create" in rights`
before rendering the button.
