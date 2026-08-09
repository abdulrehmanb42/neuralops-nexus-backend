"""
Internal API — called by nexus-ai only, not exposed to users.
Authenticated via X-Internal-API-Key header (set in INTERNAL_API_KEY env var).
"""

import os
from pydantic import Field
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja.security import APIKeyHeader
from typing import Optional


class InternalAPIKey(APIKeyHeader):
    param_name = "X-Internal-API-Key"

    def authenticate(self, request, key: str):
        expected = os.getenv("INTERNAL_API_KEY", "change-me-in-production")
        if key == expected:
            return key
        return None


internal_auth = InternalAPIKey()
router = Router(tags=["Internal"], auth=internal_auth)


# ── Response schemas ──────────────────────────────────────────────────────────


class MCPServerInternal(Schema):
    id: str
    name: str
    server_type: str
    transport: str
    url: Optional[str] = None
    command: Optional[str] = None
    config: dict
    is_first_party: bool = False
    embed_output: bool = False


class PromptInternal(Schema):
    system_prompt: str
    output_type: str
    context_scope: Optional[list] = None


class ModelInternal(Schema):
    id: str
    name: str
    provider: str
    model_id: str
    api_base: Optional[str] = None
    api_key: Optional[str] = None  # decrypted — only sent over internal network
    temperature: float
    max_tokens: int
    context_window: int
    supports_tools: bool
    supports_streaming: bool


class PersonaInternal(Schema):
    id: str
    name: str
    source_type: str  # "model" or "agent"
    prompt: PromptInternal
    model: Optional[ModelInternal] = None
    mcp_servers: list[MCPServerInternal] = Field(default_factory=list)


class ContextSourceInternal(Schema):
    id: str
    type: str  # "doc" or "code"
    label: str
    collection_id: str


class AIRequestLogIn(Schema):
    job_id: str
    msg_id: str
    persona_id: Optional[str] = None
    model_id: str
    provider: str
    prompt: list
    response: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0
    status: str = "success"
    error: Optional[str] = None


class AIConfigInternal(Schema):
    embedding_provider: str
    embedding_model: str
    embedding_base_url: str
    default_llm_model: str


class HistoryMessageInternal(Schema):
    """
    Raw message data -- deliberately NOT role-mapped or filtered here.
    Deciding "is this human/persona/system", "does this look like valid
    rendered HTML", "should a visual-type-rendered-as-text reply be shown
    as history" are all prompt-quality judgment calls, not chat-orchestration
    ones -- nexus-ai makes them (see apps/managers/nucleus_client.py).
    """
    id: str
    sender_type: str        # "human" | "persona" | "system"
    sender_name: Optional[str] = None
    content: str
    render_as: str = "text"
    output_type: str = "text"
    sequence: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/personas/{persona_id}/", response=PersonaInternal)
def get_persona_internal(request, persona_id: str):
    """
    Fetch full persona config for nexus-ai to use on trigger.
    Returns: persona + prompt + model (with decrypted api_key) + mcp_servers[]
    """
    from nucleus.models import Persona, MCPServer

    persona = (
        Persona.objects.filter(id=persona_id, is_active=True)
        .select_related("prompt", "model", "agent__mcp_server")
        .first()
    )

    if not persona:
        raise HttpError(404, "Persona not found.")

    if not hasattr(persona, "prompt") or not persona.prompt:
        raise HttpError(400, "Persona has no prompt configured.")

    prompt = persona.prompt

    model_data = None
    mcp_servers = []

    if persona.source_type == "model" and persona.model:
        m = persona.model
        model_data = ModelInternal(
            id=str(m.id),
            name=m.name,
            provider=m.provider,
            model_id=m.model_id,
            api_base=m.api_base,
            api_key=m.get_api_key(),
            temperature=m.temperature,
            max_tokens=m.max_tokens,
            context_window=m.context_window,
            supports_tools=m.supports_tools,
            supports_streaming=m.supports_streaming,
        )

    elif persona.source_type == "agent" and persona.agent:
        agent = persona.agent
        if agent.model:
            m = agent.model
            model_data = ModelInternal(
                id=str(m.id),
                name=m.name,
                provider=m.provider,
                model_id=m.model_id,
                api_base=m.api_base,
                api_key=m.get_api_key(),
                temperature=m.temperature,
                max_tokens=m.max_tokens,
                context_window=m.context_window,
                supports_tools=m.supports_tools,
                supports_streaming=m.supports_streaming,
            )
        # Collect all MCP servers linked to this agent's model
        if agent.mcp_server:
            s = agent.mcp_server
            mcp_servers.append(
                MCPServerInternal(
                    id=str(s.id),
                    name=s.name,
                    server_type=s.server_type,
                    transport=s.transport,
                    url=s.url,
                    command=s.command,
                    config=s.config,
                    is_first_party=s.is_first_party,
                    embed_output=s.embed_output,
                )
            )

    return PersonaInternal(
        id=str(persona.id),
        name=persona.name,
        source_type=persona.source_type,
        prompt=PromptInternal(
            system_prompt=prompt.system_prompt,
            output_type=prompt.output_type,
            context_scope=prompt.context_scope,
        ),
        model=model_data,
        mcp_servers=mcp_servers,
    )


@router.get("/topics/{topic_id}/contexts/", response=list[ContextSourceInternal])
def get_topic_contexts(request, topic_id: str):
    """
    Fetch all active context sources for a topic.
    nexus-ai calls this when building context for a trigger.
    """
    from nucleus.models import TopicContext

    sources = TopicContext.objects.filter(
        topic__id=topic_id,
        is_active=True,
        collection_id__isnull=False,
    ).exclude(collection_id="")

    return [
        ContextSourceInternal(
            id=str(s.id),
            type=s.context_type,
            label=s.label,
            collection_id=s.collection_id,
        )
        for s in sources
    ]


@router.post("/ai-request-logs/", response={201: dict})
def create_ai_request_log(request, payload: AIRequestLogIn):
    """
    Called by nexus-ai after every model completion.
    Writes a log record with the full prompt + raw response.
    """
    from nucleus.models import AIRequestLog, Persona, Company

    company = Company.objects.filter(is_active=True).first()
    if not company:
        raise HttpError(503, "No company found.")

    persona = None
    if payload.persona_id:
        persona = Persona.objects.filter(id=payload.persona_id, is_active=True).first()

    AIRequestLog.objects.create(
        company=company,
        job_id=payload.job_id,
        msg_id=payload.msg_id,
        persona=persona,
        model_id=payload.model_id,
        provider=payload.provider,
        prompt=payload.prompt,
        response=payload.response,
        prompt_tokens=payload.prompt_tokens,
        completion_tokens=payload.completion_tokens,
        latency_ms=payload.latency_ms,
        status=payload.status,
        error=payload.error,
    )
    return 201, {"ok": True}


@router.get("/topics/{topic_id}/history/", response=list[HistoryMessageInternal])
def get_topic_history_internal(
    request, topic_id: str,
    limit: int = 20,
    exclude_message_id: Optional[str] = None,
):
    """
    Raw recent message history for a topic -- called by nexus-ai itself
    (apps/managers/nucleus_client.py:fetch_history) right before it builds
    a prompt. `limit` is nexus-ai's own call, not something nucleus decides.

    exclude_message_id -- the human message that triggered this particular
    AI run is already saved in the DB by the time this gets called (send_message
    saves it before firing the trigger task), so it would otherwise show up as
    the newest row in its own history. Pass its id here to drop it -- it's
    sent separately as TriggerJob.message, not meant to appear twice.
    """
    from nucleus.models import ChatMessage

    qs = ChatMessage.objects.filter(topic_id=topic_id, is_active=True)
    if exclude_message_id:
        qs = qs.exclude(id=exclude_message_id)

    messages = list(
        qs.select_related("sender").order_by("-sequence")[:limit]
    )

    result = []
    for m in reversed(messages):
        metadata = m.metadata or {}
        sender_type = getattr(m.sender, "user_type", "human") if m.sender else "system"
        sender_name = None
        if m.sender:
            sender_name = metadata.get("persona_name") or m.sender.get_display_name()
        result.append(HistoryMessageInternal(
            id=str(m.id),
            sender_type=sender_type,
            sender_name=sender_name,
            content=m.content or "",
            render_as=metadata.get("render_as", "text"),
            output_type=metadata.get("output_type", "text"),
            sequence=m.sequence,
        ))
    return result


@router.get("/companies/{company_id}/ai-config/", response=AIConfigInternal)
def get_ai_config_internal(request, company_id: str):
    """
    Fetch company AI config (embedding provider, model, LLM defaults).
    nexus-ai calls this to know which embedding provider to use.
    """
    from nucleus.models import CompanyAIConfig

    config = CompanyAIConfig.objects.filter(company__id=company_id).first()

    if not config:
        raise HttpError(404, "AI config not found for this company.")

    return AIConfigInternal(
        embedding_provider=config.embedding_provider,
        embedding_model=config.embedding_model,
        embedding_base_url=config.embedding_base_url,
        default_llm_model=config.default_llm_model,
    )
