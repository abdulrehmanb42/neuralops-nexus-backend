"""
AI Intelligence API — AIModel, MCPServer, AIAgent, Persona, PromptTemplate, CompanyAIConfig.
All endpoints require Supabase JWT auth and are company-scoped.
"""
from typing import List
from ninja import Router
from ninja.errors import HttpError

from authn.auth import SupabaseBearer
from authn.permissions.checker import PermissionChecker
from .schema import (
    AIModelIn, AIModelOut,
    MCPServerIn, MCPServerPatchIn, MCPServerOut,
    AIAgentIn, AIAgentPatchIn, AIAgentOut,
    PersonaIn, PersonaPatchIn, PersonaOut,
    PromptTemplateOut,
    CompanyAIConfigIn, CompanyAIConfigOut,
    AIRequestLogOut,
)
from . import services as svc

router = Router(tags=["Intelligence"], auth=SupabaseBearer())


def _company(request):
    company = svc.get_company()
    if not company:
        raise HttpError(503, "Server not initialised.")
    return company


def _model_out(model) -> AIModelOut:
    return AIModelOut(
        id=str(model.id),
        name=model.name,
        provider=model.provider,
        model_id=model.model_id,
        api_base=model.api_base,
        secret_ref=model.secret_ref,
        description=model.description,
        licence_accepted=model.licence_accepted,
        temperature=model.temperature,
        max_tokens=model.max_tokens,
        context_window=model.context_window,
        supports_tools=model.supports_tools,
        supports_streaming=model.supports_streaming,
        supports_vision=model.supports_vision,
        supports_audio=model.supports_audio,
        config=model.config,
        is_active=model.is_active,
        has_api_key=bool(model.api_key_encrypted),
    )


def _mcp_out(server) -> MCPServerOut:
    # Server belongs to exactly one project in practice (see
    # create_mcp_server_standalone()) -- .first() is safe even though the
    # underlying field is an M2M.
    project = server.projects.first()
    return MCPServerOut(
        id=str(server.id),
        name=server.name,
        description=server.description,
        project_id=str(project.id) if project else None,
        server_type=server.server_type,
        transport=server.transport,
        url=server.url,
        command=server.command,
        docker_image=server.docker_image,
        config=server.config,
        timeout_seconds=server.timeout_seconds,
        max_retries=server.max_retries,
        is_first_party=server.is_first_party,
        embed_output=server.embed_output,
        is_active=server.is_active,
    )


def _agent_out(agent) -> AIAgentOut:
    # Agent belongs to exactly one project in practice (see create_agent()) --
    # .first() is safe even though the underlying field is an M2M.
    project = agent.projects.first()
    return AIAgentOut(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        project_id=str(project.id) if project else None,
        agent_type=agent.agent_type,
        model_id=str(agent.model_id) if agent.model_id else None,
        model_name=agent.model.name if agent.model else None,
        mcp_server_id=str(agent.mcp_server_id) if agent.mcp_server_id else None,
        mcp_server_name=agent.mcp_server.name if agent.mcp_server else None,
        system_prompt=agent.system_prompt,
        safety_mode=agent.safety_mode,
        max_steps=agent.max_steps,
        is_active=agent.is_active,
    )


def _persona_out(persona) -> PersonaOut:
    from .schema import PromptOut
    prompt = None
    if hasattr(persona, "prompt") and persona.prompt:
        p = persona.prompt
        prompt = PromptOut(
            id=str(p.id),
            system_prompt=p.system_prompt,
            output_type=p.output_type,
            context_scope=p.context_scope,
            template_id=str(p.template_id) if p.template_id else None,
        )
    return PersonaOut(
        id=str(persona.id),
        name=persona.name,
        description=persona.description,
        project_id=str(persona.project_id),
        source_type=persona.source_type,
        model_id=str(persona.model_id) if persona.model_id else None,
        agent_id=str(persona.agent_id) if persona.agent_id else None,
        prompt=prompt,
        is_active=persona.is_active,
    )


# ── AIModel endpoints ─────────────────────────────────────────────────────────
# Rights: ai_model.list / ai_model.create / ai_model.delete — COMPANY scope only
# (AI infrastructure has no project boundary, see authn/permissions/rights.py).

@router.get("/ai-models/", response=List[AIModelOut])
def list_ai_models(request):
    company = _company(request)
    return [_model_out(m) for m in svc.list_ai_models(company, request.auth)]


@router.post("/ai-models/", response=AIModelOut)
def create_ai_model(request, payload: AIModelIn):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "ai_model.create", company=company):
        raise HttpError(403, "You don't have permission to create AI models.")
    if not payload.licence_accepted:
        raise HttpError(400, "You must accept the provider's terms of service.")
    data = payload.dict()
    model = svc.create_ai_model(company, request.auth, data)
    return _model_out(model)


@router.delete("/ai-models/{model_id}/", response={204: None})
def delete_ai_model(request, model_id: str):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "ai_model.delete", company=company):
        raise HttpError(403, "You don't have permission to delete AI models.")
    if not svc.delete_ai_model(company, model_id):
        raise HttpError(404, "AI model not found.")
    return 204, None


# ── AIModel <-> Project attachment (visibility gate) ──────────────────────────
# Distinct right from ai_model.create/delete on purpose: attaching an
# already-existing model to a project never touches the model's API key, so
# it's a lighter action -- reachable by that project's own Project Admin,
# not just a COMPANY-scope Owner/Admin. See ai_model.attach in rights.py.

@router.post("/projects/{project_id}/ai-models/{model_id}/attach/", response={200: dict})
def attach_ai_model(request, project_id: str, model_id: str):
    company = _company(request)
    from nucleus.models import Project
    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise HttpError(404, "Project not found.")
    if not PermissionChecker.can(request.auth, "ai_model.attach", obj=project):
        raise HttpError(403, "You don't have permission to attach AI models to this project.")
    if not svc.attach_ai_model_to_project(company, model_id, project_id):
        raise HttpError(404, "AI model not found.")
    return {"ok": True}


@router.delete("/projects/{project_id}/ai-models/{model_id}/attach/", response={200: dict})
def detach_ai_model(request, project_id: str, model_id: str):
    company = _company(request)
    from nucleus.models import Project
    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise HttpError(404, "Project not found.")
    if not PermissionChecker.can(request.auth, "ai_model.attach", obj=project):
        raise HttpError(403, "You don't have permission to detach AI models from this project.")
    if not svc.detach_ai_model_from_project(company, model_id, project_id):
        raise HttpError(404, "AI model not found.")
    return {"ok": True}


# ── MCPServer endpoints (flat) ────────────────────────────────────────────────
# mcp_server.list is COMPANY scope (ordinary project members reach the list
# through the visible_mcp_servers() row-visibility fallback, not by holding
# this right directly). create/update/delete are PROJECT scope — a server
# belongs to exactly one project, and that project's own Admin can manage it
# without needing company-wide access (still reachable by a COMPANY-scope
# Owner/Admin too, since PROJECT reach flows down from COMPANY).

@router.get("/mcp-servers/", response=List[MCPServerOut])
def list_mcp_servers_all(request):
    """List all MCP servers for the company."""
    company = _company(request)
    return [_mcp_out(s) for s in svc.list_mcp_servers_all(company, request.auth)]


@router.post("/mcp-servers/", response=MCPServerOut)
def create_mcp_server_standalone(request, payload: MCPServerIn):
    """Create a standalone MCP server, owned by payload.project_id."""
    company = _company(request)
    from nucleus.models import Project
    project = Project.objects.filter(company=company, id=payload.project_id, is_active=True).first()
    if not project:
        raise HttpError(404, "Project not found.")
    if not PermissionChecker.can(request.auth, "mcp_server.create", obj=project):
        raise HttpError(403, "You don't have permission to create MCP servers in this project.")
    try:
        server = svc.create_mcp_server_standalone(company, payload.dict())
    except ValueError as e:
        raise HttpError(400, str(e))
    return _mcp_out(server)


@router.patch("/mcp-servers/{server_id}/", response=MCPServerOut)
def patch_mcp_server_standalone(request, server_id: str, payload: MCPServerPatchIn):
    company = _company(request)
    server = svc.get_mcp_server_standalone(company, server_id)
    if not server:
        raise HttpError(404, "MCP server not found.")
    if not PermissionChecker.can(request.auth, "mcp_server.update", obj=server):
        raise HttpError(403, "You don't have permission to edit this MCP server.")
    server = svc.update_mcp_server_standalone(company, server_id, payload.dict(exclude_none=True))
    return _mcp_out(server)


@router.delete("/mcp-servers/{server_id}/", response={204: None})
def delete_mcp_server_standalone(request, server_id: str):
    company = _company(request)
    server = svc.get_mcp_server_standalone(company, server_id)
    if not server:
        raise HttpError(404, "MCP server not found.")
    if not PermissionChecker.can(request.auth, "mcp_server.delete", obj=server):
        raise HttpError(403, "You don't have permission to delete this MCP server.")
    svc.delete_mcp_server_standalone(company, server_id)
    return 204, None


# MCPServer has no attach/detach endpoints -- it's single-project-owned (see
# create_mcp_server_standalone(), same pattern as AIAgent), assigned once at
# creation via payload.project_id. Unlike AIModel, which is genuinely shared
# across projects, there's nothing to attach/detach after the fact.


# ── MCPServer endpoints (nested under model — legacy) ─────────────────────────
# Same rights as the flat endpoints above — mcp_server.* doesn't distinguish
# by nesting, it's still a company-wide resource either way.

@router.get("/ai-models/{model_id}/mcp-servers/", response=List[MCPServerOut])
def list_mcp_servers(request, model_id: str):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "mcp_server.list", company=company):
        raise HttpError(403, "You don't have permission to view MCP servers.")
    return [_mcp_out(s) for s in svc.list_mcp_servers(company, model_id)]


@router.post("/ai-models/{model_id}/mcp-servers/", response=MCPServerOut)
def create_mcp_server(request, model_id: str, payload: MCPServerIn):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "mcp_server.create", company=company):
        raise HttpError(403, "You don't have permission to create MCP servers.")
    try:
        server = svc.create_mcp_server(company, model_id, payload.dict())
    except ValueError as e:
        raise HttpError(404, str(e))
    return _mcp_out(server)


@router.delete("/ai-models/{model_id}/mcp-servers/{server_id}/", response={204: None})
def delete_mcp_server(request, model_id: str, server_id: str):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "mcp_server.delete", company=company):
        raise HttpError(403, "You don't have permission to delete MCP servers.")
    if not svc.delete_mcp_server(company, model_id, server_id):
        raise HttpError(404, "MCP server not found.")
    return 204, None


# ── AIAgent endpoints ─────────────────────────────────────────────────────────
# agent.list is COMPANY scope (ordinary project members reach the list
# through the visible_agents() row-visibility fallback, not by holding this
# right directly). create/update/delete are PROJECT scope — an agent belongs
# to exactly one project, and that project's own Admin can manage it without
# needing company-wide access (still reachable by a COMPANY-scope Owner/Admin
# too, since PROJECT reach flows down from COMPANY).

@router.get("/agents/", response=List[AIAgentOut])
def list_agents(request):
    company = _company(request)
    return [_agent_out(a) for a in svc.list_agents(company, request.auth)]


@router.post("/agents/", response=AIAgentOut)
def create_agent(request, payload: AIAgentIn):
    company = _company(request)
    from nucleus.models import Project
    project = Project.objects.filter(company=company, id=payload.project_id, is_active=True).first()
    if not project:
        raise HttpError(404, "Project not found.")
    if not PermissionChecker.can(request.auth, "agent.create", obj=project):
        raise HttpError(403, "You don't have permission to create AI agents in this project.")
    try:
        agent = svc.create_agent(company, payload.dict())
    except ValueError as e:
        raise HttpError(400, str(e))
    return _agent_out(agent)


@router.patch("/agents/{agent_id}/", response=AIAgentOut)
def patch_agent(request, agent_id: str, payload: AIAgentPatchIn):
    company = _company(request)
    agent = svc.get_agent(company, agent_id)
    if not agent:
        raise HttpError(404, "Agent not found.")
    if not PermissionChecker.can(request.auth, "agent.update", obj=agent):
        raise HttpError(403, "You don't have permission to edit this AI agent.")
    agent = svc.update_agent(company, agent_id, payload.dict(exclude_none=True))
    return _agent_out(agent)


@router.delete("/agents/{agent_id}/", response={204: None})
def delete_agent(request, agent_id: str):
    company = _company(request)
    agent = svc.get_agent(company, agent_id)
    if not agent:
        raise HttpError(404, "Agent not found.")
    if not PermissionChecker.can(request.auth, "agent.delete", obj=agent):
        raise HttpError(403, "You don't have permission to delete this AI agent.")
    svc.delete_agent(company, agent_id)
    return 204, None


# Agents are project-owned at creation (payload.project_id) -- no separate
# attach/detach endpoints, since an agent never belongs to more than one
# project. See create_agent() in intelligence/services.py.


# ── Persona endpoints ─────────────────────────────────────────────────────────
# Rights: persona.list / persona.create / persona.update / persona.delete — COMPANY scope.
# Distinct from "persona.mention" (TOPIC-scoped — using an existing persona in
# chat), which is a separate right for a separate app (chat/api.py, not yet
# migrated).

@router.get("/personas/", response=List[PersonaOut])
def list_personas(request, project_id: str):
    """
    Personas are project-owned -- always listed for one project, never
    company-wide. Visibility is via visible_personas() (project member,
    or company-wide persona.list right) -- same pattern as ai-models/
    agents/mcp-servers, not a blanket permission check.
    """
    company = _company(request)
    from nucleus.models import Project
    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise HttpError(404, "Project not found.")
    return [_persona_out(p) for p in svc.list_personas(project, request.auth)]


@router.post("/personas/", response=PersonaOut)
def create_persona(request, payload: PersonaIn):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "persona.create", company=company):
        raise HttpError(403, "You don't have permission to create personas.")
    persona = svc.create_persona(company, request.auth, payload.dict())
    return _persona_out(persona)


@router.patch("/personas/{persona_id}/", response=PersonaOut)
def patch_persona(request, persona_id: str, payload: PersonaPatchIn):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "persona.update", company=company):
        raise HttpError(403, "You don't have permission to edit personas.")
    persona = svc.patch_persona(company, persona_id, payload.dict(exclude_none=True))
    if not persona:
        raise HttpError(404, "Persona not found.")
    return _persona_out(persona)


@router.delete("/personas/{persona_id}/", response={204: None})
def delete_persona(request, persona_id: str):
    company = _company(request)
    if not PermissionChecker.can(request.auth, "persona.delete", company=company):
        raise HttpError(403, "You don't have permission to delete personas.")
    if not svc.delete_persona(company, persona_id):
        raise HttpError(404, "Persona not found.")
    return 204, None


# ── PromptTemplate endpoints ──────────────────────────────────────────────────

@router.get("/prompt-templates/", response=List[PromptTemplateOut])
def list_prompt_templates(request):
    company = _company(request)
    return [
        PromptTemplateOut(
            id=str(t.id),
            title=t.title,
            description=t.description,
            system_prompt=t.system_prompt,
            output_type=t.output_type,
            tags=t.tags,
            is_featured=t.is_featured,
        )
        for t in svc.list_prompt_templates(company)
    ]


# ── CompanyAIConfig endpoints ─────────────────────────────────────────────────

@router.get("/ai-config/", response=CompanyAIConfigOut)
def get_ai_config(request):
    company = _company(request)
    config = svc.get_ai_config(company)
    return CompanyAIConfigOut(
        embedding_provider=config.embedding_provider,
        embedding_model=config.embedding_model,
        embedding_base_url=config.embedding_base_url,
        default_llm_model=config.default_llm_model,
    )


@router.get("/ai-request-logs/", response=List[AIRequestLogOut])
def list_ai_request_logs(request):
    """Return the last 200 AI request logs, newest first."""
    from nucleus.models import AIRequestLog
    company = _company(request)
    logs = (
        AIRequestLog.objects.filter(company=company)
        .order_by("-created_at")[:200]
    )
    return [
        AIRequestLogOut(
            id=str(log.id),
            job_id=log.job_id,
            msg_id=log.msg_id,
            persona_id=str(log.persona_id) if log.persona_id else None,
            model_id=log.model_id,
            provider=log.provider,
            prompt=log.prompt,
            response=log.response,
            prompt_tokens=log.prompt_tokens,
            completion_tokens=log.completion_tokens,
            latency_ms=log.latency_ms,
            status=log.status,
            error=log.error,
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]


@router.put("/ai-config/", response=CompanyAIConfigOut)
def update_ai_config(request, payload: CompanyAIConfigIn):
    company = _company(request)
    config = svc.update_ai_config(company, request.auth, payload.dict())
    return CompanyAIConfigOut(
        embedding_provider=config.embedding_provider,
        embedding_model=config.embedding_model,
        embedding_base_url=config.embedding_base_url,
        default_llm_model=config.default_llm_model,
    )


# ── Output Types (M7) ─────────────────────────────────────────────────────────

@router.get("/output-types/")
def list_output_types(request):
    """
    Return all available AI output types.
    Used by the frontend @mention picker to show output type directives.
    These match the types registered in nexus-ai/apps/output_types/types.py.
    """
    _company(request)  # auth check
    return [
        {"name": "text",     "label": "Text",      "icon": "align-left",    "render_as": "text"},
        {"name": "code",     "label": "Code",      "icon": "code-2",        "render_as": "code"},
        {"name": "chart",    "label": "Chart",     "icon": "bar-chart-2",   "render_as": "html"},
        {"name": "table",    "label": "Table",     "icon": "table",         "render_as": "html"},
        {"name": "diagram",  "label": "Diagram",   "icon": "git-branch",    "render_as": "html"},
        {"name": "form",     "label": "Form",      "icon": "clipboard-list","render_as": "html"},
        {"name": "html",     "label": "HTML Page", "icon": "globe",         "render_as": "html"},
        {"name": "terminal", "label": "Terminal",  "icon": "terminal",      "render_as": "terminal"},
    ]
