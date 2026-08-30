"""Schemas for the /trigger/ endpoint (nexus-nucleus → nexus-ai) and SSE events."""

import typing
from pydantic import BaseModel, Field


# ── Inbound job payload ────────────────────────────────────────────────────────


class ModelConfig(BaseModel):
    provider: str  # "litellm" | "local"
    model_id: str  # "anthropic/claude-haiku-4-5-20251001"
    api_key: str | None = None  # decrypted key from AIModel — passed per-call
    max_tokens: int = 4096
    temperature: float = 0.7
    supports_vision: bool = False


class MCPServerConfig(BaseModel):
    """MCP server descriptor passed from nexus-nucleus in the TriggerJob."""

    id: str
    name: str
    transport: str  # "stdio" | "http" | "sse" | "websocket"
    url: str | None = None  # for http/sse/websocket
    command: str | None = None  # for stdio
    config: dict = Field(default_factory=dict)
    # Decrypted secret env vars (e.g. GITHUB_PERSONAL_ACCESS_TOKEN). Forwarded
    # as subprocess env when spawning a stdio server -- never into `command`,
    # which is plain text end to end (DB, UI, this payload).
    secrets: dict = Field(default_factory=dict)
    timeout_seconds: int = 60
    is_first_party: bool = False
    embed_output: bool = False
    needs_reauth: bool = False  # NEW
    # auth_type + token_env_var: which key in `secrets` holds the bearer
    # access token to send as an Authorization header on http/sse/
    # streamable-http transports (see pydantic_ai_runner.py:_run_with_mcp).
    # stdio servers ignore this -- they get the whole `secrets` dict as
    # subprocess env instead.
    auth_type: str = "static_secrets"
    token_env_var: str = "OAUTH_ACCESS_TOKEN"


class PersonaConfig(BaseModel):
    id: str
    name: str  # "NeuralBot"
    system_prompt: str
    model: ModelConfig
    mcp_servers: list[MCPServerConfig] = Field(default_factory=list)


class HistoryMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    sender_name: str | None = None  # display only, not sent to LLM


class ContextSourceRef(BaseModel):
    source_id: str
    type: str  # "doc" | "code"
    label: str  # "auth.py"
    language: str | None = None
    collection_id: str  # Chroma collection to search


class TriggerJob(BaseModel):
    """
    Deliberately minimal (#131) -- nexus-nucleus only tells us WHO and
    WHAT, not HOW. persona_id and topic_id are resolved into a full
    PersonaConfig and history list by apps/managers/nucleus_client.py,
    right at the top of AgenticManager.run(), not here on the schema.
    context_sources is the one exception still pushed by nucleus -- see
    the comment on trigger_ai_response_async in chat/services.py for why.
    """
    job_id: str
    msg_id: str  # pre-generated UUID — used in SSE events + DB save

    persona_id: str
    topic_id: str
    user_message_id: str             # the human message this is replying to --
                                      # excluded when nucleus_client fetches history,
                                      # since it's sent separately as `message` below
    message: str                     # the user's current message (mentions stripped)
    context_sources: list[ContextSourceRef] = Field(default_factory=list)

    # M7: output type — resolved in nexus-nucleus from @mention detection.
    # "auto" = nexus-ai should classify intent via cosine similarity.
    # Any other value = explicit override (e.g. "chart", "terminal", "code").
    output_type: str = "auto"

class TriggerSwarmJob(BaseModel):
    """
    Deliberately minimal (#131) -- nexus-nucleus only tells us WHO and
    WHAT, not HOW. persona_id and topic_id are resolved into a full
    PersonaConfig and history list by apps/managers/nucleus_client.py,
    right at the top of AgenticManager.run(), not here on the schema.
    context_sources is the one exception still pushed by nucleus -- see
    the comment on trigger_ai_response_async in chat/services.py for why.
    """
    job_id: str
    msg_id: str  # pre-generated UUID — used in SSE events + DB save

    personas: list[list[str, str, str]]
    topic_id: str
    user_message_id: str             # the human message this is replying to --
                                      # excluded when nucleus_client fetches history,
                                      # since it's sent separately as `message` below
    message: str                     # the user's current message (mentions stripped)
    context_sources: list[ContextSourceRef] = Field(default_factory=list)

    # M7: output type — resolved in nexus-nucleus from @mention detection.
    # "auto" = nexus-ai should classify intent via cosine similarity.
    # Any other value = explicit override (e.g. "chart", "terminal", "code").
    output_type: str = "auto"

# ── Outbound SSE events (nexus-ai → nexus-nucleus) ────────────────────────────


class ToolCallData(BaseModel):
    name: str
    args: dict


class AgentEvent(BaseModel):
    type: str                        # "message_start" | "message_delta" | "message_done" | "message_error"
    id: str                          # msg_id

    # message_start only
    created_at: str | None = None
    persona_id: str | None = None
    persona_name: str | None = None
    
    # message_delta only
    delta: str | None = None

    # tool_call_start only
    tool_call: ToolCallData | None = None

    # message_done only
    content: str | None = None  # full assembled response (markers stripped) for DB save

    # M7: output type metadata — populated in message_done
    output_type: str | None = None  # resolved type: "chart", "terminal", "text", etc.
    render_as: str | None = None  # renderer hint: "html" | "code" | "text" | "terminal"

    # M8: embed description — text inside <<<EMBED>>>...<<<END_EMBED>>> block
    # Only present for html/form/terminal render_as. Used instead of raw HTML for embedding.
    embed_description: str | None = None

    # message_error only -- see apps/routers/trigger.py:_event_stream. Emitted
    # when anything in AgenticManager.run() raises (persona resolve, history
    # fetch, the LLM call itself, ...), so the SSE stream ends with one clean
    # event nucleus can act on instead of the connection just dying mid-body.
    error: str | None = None
    error_code: str | None = None  # NEW -- e.g. "mcp_reauth_required"

    # swarm_transition only
    metadata: dict | None = None
