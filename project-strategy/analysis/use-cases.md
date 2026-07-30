# NeuralOps Backend API Catalog

Compiled directly from source (`nexus-nucleus`, `nexus-ai`, `mcps/`) in the `staging` branch. Paths are relative to each service's base URL.

- **nexus-nucleus** (Django Ninja) — base path `/api/v1/` — staging: `http://192.168.1.90:8081/api/v1/`
- **nexus-ai** (FastAPI, internal only) — staging: `http://192.168.1.90:8002/`
- **mcps/** (standalone MCP tool servers, JSON-RPC over streamable-http, not REST) — ports 9043–9045

Auth column: `Bearer` = Supabase JWT (`SupabaseBearer`), `Internal Key` = `X-Internal-API-Key` / `X-Internal-Key` header, `None` = public.

---

## 1. Authentication & Onboarding

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| Get the server's public URL to share with others | Server Config | `GET /api/v1/auth/config/` | None |
| Sign in with a Supabase access token | Sign In | `POST /api/v1/auth/signin` | None |
| Start device activation flow | Auth Init | `GET /api/v1/auth/init/` | None |
| Poll device activation status | Auth Status | `GET /api/v1/auth/status/` | None |
| Verify JWT + server access on connect (auto-accepts pending invite) | Verify Connection | `GET /api/v1/auth/verify/` | Bearer |
| Preview invite details before login (portal invite page) | Invite Preview | `GET /api/v1/auth/invite-preview/?token=` | None |
| Change your display name | Change Username | `POST /api/v1/auth/change-username/` | Bearer |

## 2. Server Members

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| Invite a new member to the server | Invite Member | `POST /api/v1/members/invite/` | Bearer |
| List all server members | List Members | `GET /api/v1/members/` | Bearer |
| Remove a member from the server | Remove Member | `DELETE /api/v1/members/{user_id}/` | Bearer |

## 3. Workspace — Projects, Channels, Topics

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| List projects | List Projects | `GET /api/v1/projects/` | Bearer |
| Create a project | Create Project | `POST /api/v1/projects/` | Bearer |
| Get a single project | Get Project | `GET /api/v1/projects/{project_id}/` | Bearer |
| Delete a project | Delete Project | `DELETE /api/v1/projects/{project_id}/` | Bearer |
| List channels in a project | List Channels | `GET /api/v1/projects/{project_id}/channels/` | Bearer |
| Create a channel | Create Channel | `POST /api/v1/projects/{project_id}/channels/` | Bearer |
| List topics in a channel | List Topics | `GET /api/v1/projects/{project_id}/channels/{channel_id}/topics/` | Bearer |
| Create a topic | Create Topic | `POST /api/v1/projects/{project_id}/channels/{channel_id}/topics/` | Bearer |
| Rename a topic | Update Topic | `PATCH /api/v1/projects/{project_id}/channels/{channel_id}/topics/{topic_id}/` | Bearer |
| Mark a topic as read | Mark Topic Read | `POST /api/v1/projects/{project_id}/channels/{channel_id}/topics/{topic_id}/read/` | Bearer |

## 4. Project Team

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| List a project's team (humans + personas) | List Team | `GET /api/v1/projects/{project_id}/team/` | Bearer |
| Add an existing user/persona to a project | Add Member | `POST /api/v1/projects/{project_id}/team/` | Bearer |
| Run the `/invite` slash command in chat | Invite To Project | `POST /api/v1/projects/{project_id}/team/invite/` | Bearer |
| List users not yet on the project (add-member picker) | Available Users | `GET /api/v1/projects/{project_id}/team/available-users/?search=` | Bearer |
| List personas not yet on the project | Available Personas | `GET /api/v1/projects/{project_id}/team/available-personas/` | Bearer |
| Remove a member from a project | Remove Team Member | `DELETE /api/v1/projects/{project_id}/team/{user_id}/` | Bearer |
| Remove a user from the server entirely (owner action) | Remove From Server | `DELETE /api/v1/projects/server/members/{user_id}/` | Bearer |

## 5. Chat Messaging

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| Load message history when opening a topic | List Messages | `GET /api/v1/projects/{project_id}/channels/{channel_id}/topics/{topic_id}/messages/` | Bearer |
| Send a message (saves, broadcasts via Centrifugo, embeds, and routes to AI on @mention / active session) | Send Message | `POST /api/v1/projects/{project_id}/channels/{channel_id}/topics/{topic_id}/messages/` | Bearer |

## 6. Context Sources & Context Panel

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| List available `@directives` (proxied from nexus-ai) | List Directives | `GET /api/v1/projects/context-sources/directives/` | Bearer |
| List context sources attached to a topic | List Context Sources | `GET /api/v1/projects/{project_id}/topics/{topic_id}/context-sources/` | Bearer |
| Attach a file as context | Attach File | `POST /api/v1/projects/{project_id}/topics/{topic_id}/context-sources/file/` | Bearer |
| Attach a web URL as context | Attach Web | `POST /api/v1/projects/{project_id}/topics/{topic_id}/context-sources/web/` | Bearer |
| Detach a context source (legacy single-item) | Detach Context Source | `DELETE /api/v1/projects/{project_id}/topics/{topic_id}/context-sources/{source_id}/` | Bearer |
| Get the full context panel tree (files, chat history, etc.) | Get Context Panel | `GET /api/v1/projects/{project_id}/topics/{topic_id}/context-panel/` | Bearer |
| Bulk-remove items from context | Delete Panel Items | `DELETE /api/v1/projects/{project_id}/topics/{topic_id}/context-panel/items/` | Bearer |

## 7. AI Intelligence — Models, MCP Servers, Agents, Personas

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| List AI models | List AI Models | `GET /api/v1/ai-models/` | Bearer |
| Register an AI model | Create AI Model | `POST /api/v1/ai-models/` | Bearer |
| Delete an AI model | Delete AI Model | `DELETE /api/v1/ai-models/{model_id}/` | Bearer |
| List all MCP servers | List MCP Servers | `GET /api/v1/mcp-servers/` | Bearer |
| Register an MCP server (used by `/add_mcp`) | Create MCP Server | `POST /api/v1/mcp-servers/` | Bearer |
| Delete an MCP server | Delete MCP Server | `DELETE /api/v1/mcp-servers/{server_id}/` | Bearer |
| List MCP servers nested under a model *(legacy)* | List MCP Servers (nested) | `GET /api/v1/ai-models/{model_id}/mcp-servers/` | Bearer |
| Create MCP server nested under a model *(legacy)* | Create MCP Server (nested) | `POST /api/v1/ai-models/{model_id}/mcp-servers/` | Bearer |
| Delete MCP server nested under a model *(legacy)* | Delete MCP Server (nested) | `DELETE /api/v1/ai-models/{model_id}/mcp-servers/{server_id}/` | Bearer |
| List AI agents | List Agents | `GET /api/v1/agents/` | Bearer |
| Create an AI agent | Create Agent | `POST /api/v1/agents/` | Bearer |
| Delete an AI agent | Delete Agent | `DELETE /api/v1/agents/{agent_id}/` | Bearer |
| List personas | List Personas | `GET /api/v1/personas/` | Bearer |
| Create a persona | Create Persona | `POST /api/v1/personas/` | Bearer |
| Update a persona | Patch Persona | `PATCH /api/v1/personas/{persona_id}/` | Bearer |
| Delete a persona | Delete Persona | `DELETE /api/v1/personas/{persona_id}/` | Bearer |
| List reusable prompt templates | List Prompt Templates | `GET /api/v1/prompt-templates/` | Bearer |
| Get company-wide AI config (embedding provider/model, default LLM) | Get AI Config | `GET /api/v1/ai-config/` | Bearer |
| Update company-wide AI config | Update AI Config | `PUT /api/v1/ai-config/` | Bearer |
| View recent AI request logs (last 200) | List AI Request Logs | `GET /api/v1/ai-request-logs/` | Bearer |
| List available output types (chart, table, diagram, etc.) for the `@mention` picker | List Output Types | `GET /api/v1/output-types/` | Bearer |

## 8. Internal — nexus-ai → nexus-nucleus only

Not exposed to the frontend. Called by the `nexus-ai` service when assembling or logging a trigger.

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| Fetch a persona's full config (prompt, model incl. decrypted key, MCP servers) for a trigger | Get Persona (internal) | `GET /api/v1/internal/personas/{persona_id}/` | Internal Key |
| Fetch active context sources for a topic | Get Topic Contexts | `GET /api/v1/internal/topics/{topic_id}/contexts/` | Internal Key |
| Log an AI request/response after completion | Create AI Request Log | `POST /api/v1/internal/ai-request-logs/` | Internal Key |
| Fetch a company's AI config by ID | Get AI Config (internal) | `GET /api/v1/internal/companies/{company_id}/ai-config/` | Internal Key |

## 9. nexus-ai Service (FastAPI — the AI worker)

Base: `http://192.168.1.90:8002/` in staging. Called by nucleus, not by the frontend directly.

| Use Case | API Name | Method & URL | Auth |
|---|---|---|---|
| Trigger a persona's AI response, streamed via SSE | Trigger | `POST /api/v1/trigger/` | Internal Key |
| List registered context directives (embed-side) | List Directives | `GET /api/v1/directives/` | Internal Key |
| Embed a document/code context source | Embed | `POST /api/v1/embed/` | Internal Key |
| Delete all vectors for a context source | Delete Context Source Vectors | `DELETE /api/v1/embed/context-source/{collection_id}/` | Internal Key |
| Embed a single chat message | Embed Message | `POST /api/v1/embed/message/` | Internal Key |
| Delete a single chat message's vector | Delete Message Vector | `DELETE /api/v1/embed/message/{message_id}/?company_id=` | Internal Key |
| Verify an AI model's API key is valid | Verify Model | `POST /api/v1/internal/models/verify` | None |
| Verify an agent's config | Verify Agent | `POST /api/v1/internal/agents/verify` | None |
| List supported LLM providers | List Providers | `GET /api/v1/internal/providers` | None |
| Service status | Root | `GET /` | None |
| Health check | Health | `GET /health` | None |

## 10. MCP Tool Servers (`mcps/`)

Not REST — JSON-RPC 2.0 over streamable-http (`initialize` → `tools/call`). Registered into the app via **Use Case §7 → Create MCP Server**.

**SerpAPI / Shopping** — `http://192.168.1.90:9043/mcp`

| Use Case | Tool Name |
|---|---|
| Search products across retailers via Google Shopping | `search_products` |
| Compare a product's price across all retailers | `compare_prices` |
| Search BestBuy specifically | `search_bestbuy` |
| Search Walmart specifically | `search_walmart` |

**Odoo ERP** — `http://192.168.1.90:9044/mcp`

| Use Case | Tool Name |
|---|---|
| List sales orders | `list_orders` |
| Get full detail of one sales order | `get_order_detail` |
| Create and confirm a sales order | `create_sale_order` |
| List customers | `list_customers` |
| Create a customer | `create_customer` |
| Get stock levels for storable products | `inventory_report` |
| Create a product | `create_product` |

**Filesystem** — `http://192.168.1.90:9045/mcp` (official `@modelcontextprotocol/server-filesystem`, read-only mount)

| Use Case | Tool Name |
|---|---|
| Read a file | `read_file` |
| List a directory | `list_directory` |
| Search for files | `search_files` |
| Get file metadata | `get_file_info` |

---

## Notes / caveats

- **Routers `team_api.py` and `members_api.py`** in `workspace/` exist on disk but are **not wired into `authn/urls.py`** — the endpoints actually served come from `workspace/api.py`, which contains an equivalent, consolidated copy of the same routes. Treat those two files as dead code unless something else still imports them.
- **`intelligence` router is mounted at `/` (no prefix)**, so its paths sit directly under `/api/v1/`, not under `/api/v1/intelligence/`.
- **MCP tool calls from a persona execute inside the `nexus-ai` container**, on `staging-network` — so MCP server URLs registered via §7 must use the host LAN IP (`192.168.1.90`), not `localhost`, or persona tool calls will fail with connection refused.
