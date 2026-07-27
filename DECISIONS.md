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

## 11. Docker Container Names (node3)

| Service    | Container name     |
|------------|--------------------|
| Django app | `nexus-nucleus`    |
| PostgreSQL | `nexus-postgres`   |

Backup command (credentials from `.env`):
```bash
cd /data/code/neuralops-backend
source .env 2>/dev/null || export $(cat .env | grep -v ^# | xargs)
docker exec nexus-postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backups/neuralops_$(date +%Y%m%d_%H%M%S).sql
```

Backups live at: `/data/code/neuralops-backend/backups/`

---

## 12. MCP Tool Usage Rules

- **File reads/writes on node3:** use `mcp__node3-neuralops-backend__*` tools
- **Shell commands on node3:** NOT available via MCP — give the user the command to run manually
- **`mcp__MKTV-AMAZON-SHELL__shell_execute`** is for a different server entirely — do NOT use for neuralops/node3
- **`mcp__workspace__bash`** runs in an isolated Linux sandbox — cannot SSH to node3

---

## 13. /invite Slash Command — Persona vs Human

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

## 15. Human Invite Flow — `/invite email@example.com`

**Full flow:**
1. Inviter types `/invite x@x.com` in chat
2. Backend creates `Invitation` record (token_hash, 30-day expiry, project_id in access_payload)
3. Backend returns `invite_url = {PORTAL_URL}/invite?server_url={SERVER_URL}&token={RAW_TOKEN}`
4. Frontend shows toast with **"Copy invite link"** button (30s duration)
5. Inviter copies link and sends it to invitee (email, WhatsApp, etc.)
6. Invitee clicks link → portal page at `/invite?server_url=...&token=...`
7. Portal calls `GET {SERVER_URL}/api/v1/auth/invite-preview/?token={TOKEN}` → gets company name, inviter name, email
8. Portal shows: "You've been invited to join [company] by [inviter]. Sign in to accept."
9. Invitee signs in/up on portal → portal connects to server URL
10. Server calls `auth_verify()` → finds pending invitation by email → auto-accepts → creates CompanyAccess → adds to project

**Key files:**
- `workspace/services.py` → `invite_to_project()` — generates raw token, builds invite_url
- `workspace/schema.py` → `InviteToProjectOut` — includes `invite_url` field
- `authn/api.py` → `GET /auth/invite-preview/` — public, no auth, returns invite details for portal
- `authn/services.py` → `auth_verify()` → `_add_user_to_invited_project()` — auto-accepts on connect
- `MessageInput.tsx` → shows "Copy invite link" toast
- `workspace.service.ts` → `inviteToProject()` return type includes `invite_url`

**Portal contract:**
- Page: `{PORTAL_URL}/invite?server_url={URL}&token={TOKEN}`
- Calls: `GET {server_url}/api/v1/auth/invite-preview/?token={token}`
- After auth: connects to `server_url` → triggers `auth_verify()`

---

## 16. App Version — Changelog

**Single source of truth:** `modules/neuralops-react-app/src/lib/version.ts`

Increment `APP_VERSION` on every meaningful change. Update the log below.

| Version | Date       | Changes                                      |
|---------|------------|----------------------------------------------|
| 0.1     | 2026-07-20 | Initial alpha — About dialog, version system |
| 0.1.1   | 2026-07-26 | Fix pydantic-ai 2.x MCP path — rewrite `_run_with_mcp` using `FastMCPClient` + `litellm.acompletion()` directly |
| 0.1.2   | 2026-07-27 | Session UX (open/close system messages, `@session end`, WARNING logs, content guard); persona edit dialog (PATCH); system message rendering in frontend |

**About dialog:** `src/components/layout/AboutDialog.tsx`
Opened via the `ⓘ` button in the Sidebar footer.

---

## 17. Session UX — Confirmed Behaviour & Rules

**Session open:** `@PersonaName @session` — creates a `ChatSession` in DB and shows a system message:
> *Session with @PersonaName opened (30 min). Plain messages will go to them automatically.*

**Session close:** `@session close` OR `@session end` — both accepted, shows:
> *Session closed.*

**Trigger guard:** When opening a session, personas are only triggered if the message contains
content beyond the @mention(s). A bare `@Sara @session` opens the session without triggering Sara.
Only `@Sara @session hello, how are you?` would trigger Sara.

**Logging:** Session operations log at `WARNING` level so they appear in Docker logs even
without a custom `LOGGING` config in `settings.py` (default Django level is WARNING).

**System messages** are stored in the DB with `sender=None`, `message_type="system"`.
They are published to Centrifugo as a `"message"` event with `sender_type="system"`.
The frontend renders them as a centered separator line (not a chat bubble).

**Files:**
- `chat/services.py` → `_SESSION_RE`, `_SESSION_CLOSE_RE`, `extract_session_directive()`
- `chat/api.py` → Rules 1–5 in `send_message()`, `_save_system_message`
- `neuralops-react-app/src/hooks/useChat.ts` → `toUiMessage()` maps `sender_type="system"` → `type: "system"`
- `neuralops-react-app/src/components/chat/MessageItem.tsx` → system branch renders separator
- `neuralops-react-app/src/components/chat/types.ts` → `MessageSender.type` includes `"system"`

---

## 18. Persona Edit — PATCH Support

**What can be patched:** `name`, `description`, `prompt.system_prompt`, `prompt.output_type`.
The agent/model backing the persona cannot be changed after creation — delete and recreate if needed.

**Backend:** `PATCH /api/v1/personas/{id}/` → `PersonaPatchIn` schema → `patch_persona()` in `intelligence/services.py`.

**Frontend:** Pencil (✏️) button on each persona row in **AI Intelligence → Personas** tab.
Opens a pre-filled edit dialog. Changes take effect immediately (no restart needed).

**Files:**
- `intelligence/api.py` → `patch_persona()` endpoint
- `intelligence/schema.py` → `PersonaPatchIn`
- `intelligence/services.py` → `patch_persona()`
- `neuralops-react-app/src/services/personas.service.ts` → `patchPersona()`
- `neuralops-react-app/src/routes/app.agents.tsx` → `PersonasTab` edit dialog

---

## 19. pydantic-ai 2.x — MCP Architecture

**DO NOT use pydantic-ai Agent for LLM calls. Use `FastMCPClient` + `litellm` directly.**

In pydantic-ai 2.x:
- `LiteLLMModel` → removed entirely
- `MCPServerStreamableHTTP` / `MCPServerStdio` → replaced by `MCPToolset(FastMCPClient(...))`
- `LiteLLMProvider` → proxy-only (needs a running LiteLLM server; does NOT do in-process routing)
- `AnthropicModel` → needs `pydantic-ai-slim[anthropic]` extra; NOT in our requirements
- Available in `pydantic_ai.mcp`: `FastMCPClient`, `MCPToolset`, `MCPToolsetClient`, `FastMCP`

**The working pattern (MCP path in `pydantic_ai_runner.py`):**

```python
import contextlib, json
from pydantic_ai.mcp import FastMCPClient

async with contextlib.AsyncExitStack() as stack:
    client = await stack.enter_async_context(FastMCPClient(url_or_config))
    tools = await client.list_tools()          # list of MCP tool objects
    result = await client.call_tool(name, args) # call a tool

# LLM calls: use litellm.acompletion() directly — same as fast path.
# litellm handles anthropic/, openai/, local/ routing via model_id prefix.
response = await litellm.acompletion(model="anthropic/claude-...", messages=..., tools=...)
```

**Why this works:** litellm already routes `anthropic/claude-haiku-4-5-20251001` correctly
(the fast path proves it). pydantic-ai is used **only** as an MCP client library.

**Why this broke:** `_run_with_mcp` only fires when a persona has `mcp_servers` configured.
Sara/Marco worked before they were wired to nexus-serp-mcp (fast path only, no pydantic-ai).

**Rule:** Verify any third-party class exists in the installed version before using it.
Do NOT assume API compatibility across major versions without checking.

**Files:** `modules/nexus-ai/apps/implementations/agents/pydantic_ai_runner.py`
**requirements.txt:** `pydantic-ai-slim[openai,mcp,anthropic]` (anthropic extra for future use)

---

## 20. Before Starting Any Task

1. Read this file (`DECISIONS.md`)
2. Read the specific files you intend to edit — do not assume their contents
3. Check if the feature already exists before implementing it
4. If a requirement contradicts something in this file, ask the owner before proceeding
