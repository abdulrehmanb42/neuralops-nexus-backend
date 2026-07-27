# NeuralOps — Decisions & Design Rules

This file must be read at the start of every session before touching any code.
It records product decisions, architectural constraints, and things that have
been explicitly decided (and must NOT be changed without the owner's approval).

---

## 1. Personas — Scope & Team Membership

**Decision:** A persona belongs to exactly ONE project team.
Personas are NOT global. They must be explicitly added to a project either via:
- The "Add to Team → Add Persona" dialog
- `/invite @PersonaName` slash command inside a chat topic (adds to that project)

They do NOT auto-join all projects on creation, and new projects do NOT
auto-receive all personas.

**Why decided:** Owner explicitly said:
> "no this is separate project, remember that Personas, until to be called
> in another group, will be tied to one group"

**Files involved:**
- `intelligence/services.py` → `create_persona()` — does NOT add to any project
- `workspace/services.py` → `create_project()` — does NOT add any personas
- `workspace/api.py` → `POST /{project_id}/team/` — manual add only
- `workspace/services.py` → `invite_to_project()` — handles `persona_name` arg

---

## 2. Personas — Shadow User Pattern

Each persona gets a Django `User` record with `user_type="persona"` called a
"shadow user". The `Persona` model has a OneToOne to this via `identity_user`
(related_name `persona_profile`).

**On deletion:** `delete_persona()` must:
1. Rename `persona.name` to `"{name}_deleted_{uuid8}"` (frees unique constraint)
2. Set `identity_user.username = "deleted_{uuid8}"` and `is_active = False`
3. Soft-delete the Persona record

**On creation:** `create_persona()` must generate a unique username with
incremental suffix: `persona_ryan`, `persona_ryan_1`, etc.

**Files:** `intelligence/services.py` → `create_persona()`, `delete_persona()`

---

## 3. Human Display Name

**Decision:** `Human` profile records are NEVER created for device-auth users.
Only the `User` record is created on login.

`_format_member()` in `workspace/services.py` MUST use `user.get_display_name()`
for human members, NOT `user.human_profile.full_name`. The `Human` profile
lookup is a secondary fallback only if the record happens to exist.

`User.get_display_name()` returns `display_name` if set (assigned via
`assign_display_name()` on first login), else derives from email local-part.

**Files:** `workspace/services.py` → `_format_member()`

---

## 4. Team Sidebar — @handle Display

**Decision:** Team members in the sidebar are shown with an `@` prefix:
`@Ryan`, `@noamanfaisal`, etc.

**File:** `neuralops-react-app/src/components/layout/Sidebar.tsx`
The `@` is prepended in JSX: `@{member.name}`

---

## 5. Topic Naming — Auto-Create & Auto-Rename

**Decision:** Users do NOT type topic names. Topics are:
1. **Created** automatically as `chat#N` (N = existing topics count + 1)
2. **Renamed** automatically after the first AI response, using the text of
   the first human message (stripped of @mentions, max 60 chars)

No dialog is shown for topic name input.

**Files:**
- `neuralops-react-app/src/components/chat/TopicList.tsx` → `handleNewTopic()`
- `neuralops-react-app/src/hooks/useChat.ts` → `message_done` handler
- `workspace/services.py` → `update_topic()`
- `workspace/api.py` → `PATCH /{project_id}/channels/{channel_id}/topics/{topic_id}/`

---

## 6. API Routing — Active Routers Only

**The only mounted router for workspace/team is `workspace/api.py`.**
`workspace/team_api.py` and `workspace/team_services.py` exist as reference
files but are NOT mounted in `authn/urls.py` and are NOT active.

When fixing team/workspace bugs, always edit:
- `workspace/services.py` (active service layer)
- `workspace/api.py` (active API layer)

**File:** `authn/urls.py` — source of truth for what is mounted.

---

## 7. Soft-Delete Pattern

All models inherit `BaseModel` which has `soft_delete()` that sets
`is_active = False`. Records are NEVER hard-deleted.

Consequences:
- Unique constraints can be violated when re-creating deleted records
- `delete_persona()` renames the record before soft-deleting to free constraints
- `list_team()` filters `user__is_active=True` to exclude deactivated shadow users

---

## 8. Delete Button — 204 No Content

`DELETE` endpoints return HTTP 204 (no body). The frontend `apiRequest()` helper
must NOT call `.json()` on 204 responses. Fixed in `api-client.ts`:

```ts
if (res.status === 204) return undefined as T;
```

**File:** `neuralops-react-app/src/services/api-client.ts`

---

## 9. Projects — Current State (as of last session)

| Project            | Personas in team                  |
|--------------------|-----------------------------------|
| FilePilot          | @Ryan (Coder), @Alex (DevOps), @Sam (System Designer) |
| Canada Economic Trends | @Marco (SerpAPI), @Diana (model/charts) |
| Research On TVs    | @Sara (SerpAPI)                   |

Personas must be added manually via the team dialog if not yet added.
Use the sync shell command if needed (see below).

---

## 10. One-Time DB Sync Command

To add existing personas to specific project teams (run on node3):

```bash
docker exec nexus-nucleus python manage.py shell -c "
from nucleus.models import Persona, Project, ProjectMember, Company
company = Company.objects.filter(is_active=True).first()
# Add persona to ONE specific project:
persona = Persona.objects.get(company=company, name='Ryan', is_active=True)
project = Project.objects.get(company=company, name='FilePilot', is_active=True)
ProjectMember.objects.get_or_create(
    company=company, project=project, user=persona.identity_user,
    defaults={'role': 'member'},
)
print('Done')
"
```

---

## 11. MCP Tool Usage Rules

- **File reads/writes on node3:** use `mcp__node3-neuralops-backend__*` tools
- **Shell commands on node3:** NOT available via MCP — give the user the command to run manually
- **`mcp__MKTV-AMAZON-SHELL__shell_execute`** is for a different server entirely — do NOT use for neuralops/node3
- **`mcp__workspace__bash`** runs in an isolated Linux sandbox — cannot SSH to node3

---

## 12. /invite Slash Command — Persona vs Human

**Decision:** `/invite` detects the argument type automatically:
- `/invite @Ryan` or `/invite Ryan` — persona (no `@` in middle = not an email)
- `/invite email@example.com` — human (has `@` in middle = email)
- `/invite email@example.com project` — human, added to project scope

Persona invite calls `invite_to_project()` with `persona_name` (not `email`).
It adds the persona to the **current project** only (not global).

**Files involved:**
- `workspace/schema.py` → `InviteToProjectRequest` has both `email` and `persona_name` (both optional)
- `workspace/services.py` → `invite_to_project()` — persona branch runs before email branch
- `workspace/api.py` → passes both fields from payload
- `workspace.service.ts` → `inviteToProject()` payload type accepts either field
- `MessageInput.tsx` → `handleInviteCommand()` detects persona vs email

---

## 13. Before Starting Any Task

1. Read this file (`DECISIONS.md`)
2. Read the specific files you intend to edit — do not assume their contents
3. Check if the feature already exists before implementing it
4. If a requirement contradicts something in this file, ask the owner before proceeding
