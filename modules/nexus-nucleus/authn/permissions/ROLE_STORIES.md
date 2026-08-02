# Role stories

One set of stories per role, per scope it's actually assignable at.
Revised after review — several scopes were cut entirely rather than
just having their rights adjusted, noted inline below.

Format: `As a [role] at [scope], I want to..., so that...` — plus a
couple of "I should NOT be able to..." lines per role, since knowing
what's deliberately withheld matters as much as what's granted.

---

## Owner — Company scope only

No Project Owner and no Topic Owner. Admin is the top tier at those two
scopes; Owner exists at the Company level only.

- As the Company Owner, I want to do everything an Admin can, so that I never hit a wall managing my own company.
- As the Company Owner, I want to delete the company entirely, so that I can shut it down if I need to.
- As the Company Owner, I should not be removable by anyone else, including another Admin — there must always be exactly one, and the last Owner can't be stripped of the role.
- There is no ownership transfer. If the Owner needs to be replaced, that means re-initializing the system from scratch (`manage.py create_owner`), not a "transfer" action — no right exists for handing ownership to someone else.

---

## Admin

### Company Admin
- As a Company Admin, I want to invite and remove company members, so that I can manage who has access.
- As a Company Admin, I want to create new projects, so that teams can start new work.
- As a Company Admin, I want to create/manage AI models, MCP servers, agents, and personas, so that I can build out the company's AI infrastructure.
- As a Company Admin, I should not be able to delete the company or remove the Owner — those stay Owner-only.

### Project Admin
- As a Project Admin, I want to create channels and topics inside my project, so that the team can organize their work.
- As a Project Admin, I want to add and remove people from my project, so that I control who's on the team.
- As a Project Admin, I should not be able to create a Persona, AI Model, MCP Server, or AI Agent, even though I have "Admin" in my title — those are company-wide resources and my authority stops at the edge of my project.
- As a Project Admin, I should not be able to delete the project itself. **Open question, since Project Owner no longer exists**: with no Project Owner to hold `project.delete`, that right currently only reaches Company Owner (Company Admin doesn't have it either, by earlier design). That means deleting any project in the company would only ever be possible from the very top. Confirm that's intended, or say who else should get it.

### Topic Admin
- As a Topic Admin, I want to manage settings and participants within one topic, so that I can run that conversation without needing project-wide access.
- As a Topic Admin, I should not be able to create a new channel or a sibling topic — there's nothing above a topic for this assignment to reach.

---

## Member — no Company scope

Member only exists at Project and Topic scope. There is no
company-wide Member tier.

### Project Member
- As a Project Member, I want to create topics inside any channel in my project, so that I can start new conversations.
- As a Project Member, I want to open and close AI sessions, and @mention personas, so that I can actually use the AI features day to day.
- As a Project Member, I should not be able to create a new channel — that's an Admin action.
- As a Project Member, I should not be able to invite or remove anyone from the project.

### Topic Member
- As a Topic Member, I want to chat, mark the topic read, open a session, and @mention personas — but only in the one topic I was added to.
- As a Topic Member, I should not be able to see or act on any other topic in the same channel or project, until someone explicitly adds me there too, or promotes me to a broader scope.

---

## Viewer — not yet reviewed, left as originally written

### Company / Project / Topic Viewer (same behavior at every scope)
- As a Viewer, I want to see everything at my scope — projects, channels, topics, messages — so that I can stay informed without needing to act.
- As a Viewer, I should not be able to create anything, open a session, or @mention a persona — read-only means read-only, not "read plus trigger AI."
- As a Viewer, I should not be mistaken for a Member just because I can see the same content — the distinction is entirely about write/act rights, not visibility.

Given Owner and Member both lost scopes above, worth confirming: does
Viewer still exist at all three scopes, or does the same narrowing
apply here too?

---

## Custom role example — Persona Builder (Company scope) — not yet reviewed

Included to show a custom role doesn't need to follow the four-tier
shape at all — it can be as narrow as one job.

- As a Persona Builder, I want to create, update, and delete personas, so that I can maintain the company's AI personas without needing full Admin access.
- As a Persona Builder, I should not be able to invite/remove company members, create projects, or touch AI Models/MCP Servers/Agents — this role is deliberately narrow to just personas.
- As a Persona Builder, I want to be assignable to someone alongside their existing Member or Admin role, so that granting this one capability doesn't require re-doing their whole access setup.
