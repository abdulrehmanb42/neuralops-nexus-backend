"""
Business logic for AI Models, Personas, Prompts, and PromptTemplates.
All queries are scoped to company — safe for multi-tenant use.
"""
from django.contrib.auth import get_user_model

User = get_user_model()


def get_company():
    from nucleus.models import Company
    return Company.objects.filter(is_active=True).first()


# ── AIModel ───────────────────────────────────────────────────────────────────

def list_ai_models(company, user):
    from authn.permissions.row_rules import visible_ai_models
    return visible_ai_models(user, company)


def get_ai_model(company, model_id: str):
    from nucleus.models import AIModel
    return AIModel.objects.filter(company=company, id=model_id, is_active=True).first()


def create_ai_model(company, user, data: dict) -> "AIModel":
    from nucleus.models import AIModel
    api_key = data.pop("api_key", None)
    model = AIModel(company=company, created_by=user, **data)
    if api_key:
        model.set_api_key(api_key)
    model.save()
    return model


def attach_ai_model_to_project(company, model_id: str, project_id: str) -> bool:
    from nucleus.models import AIModel, Project
    model = AIModel.objects.filter(company=company, id=model_id, is_active=True).first()
    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not model or not project:
        return False
    model.projects.add(project)
    return True


def detach_ai_model_from_project(company, model_id: str, project_id: str) -> bool:
    from nucleus.models import AIModel
    model = AIModel.objects.filter(company=company, id=model_id, is_active=True).first()
    if not model:
        return False
    model.projects.remove(project_id)
    return True


def delete_ai_model(company, model_id: str) -> bool:
    from nucleus.models import AIModel
    model = AIModel.objects.filter(company=company, id=model_id, is_active=True).first()
    if not model:
        return False
    model.soft_delete()
    return True


# ── MCPServer ─────────────────────────────────────────────────────────────────

def list_mcp_servers_all(company, user):
    """List all MCP servers visible to this user (flat, not filtered by model)."""
    from authn.permissions.row_rules import visible_mcp_servers
    return visible_mcp_servers(user, company)


def create_mcp_server_standalone(company, data: dict):
    """
    Create a standalone MCP server, not tied to a specific model.

    MCP servers are project-owned, same pattern as AIAgent: the `projects`
    M2M is kept structurally, but only ever gets exactly one entry (the
    project in data['project_id']) -- no attach-to-another-project endpoint
    exists, so in practice a server never belongs to more than one project.
    """
    from nucleus.models import MCPServer, Project
    project_id = data.pop("project_id")
    client_secret = data.pop("client_secret", None)
    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise ValueError("Project not found")

    # No DB-level per-project uniqueness (see Meta.constraints NOTE on
    # MCPServer) -- checked here instead.
    if MCPServer.objects.filter(company=company, name=data.get("name"), projects=project, is_active=True).exists():
        raise ValueError(f"An MCP server named '{data.get('name')}' already exists in this project.")

    server = MCPServer.objects.create(company=company, **data)
    if client_secret:
        server.set_secrets({**server.get_secrets(), "client_secret": client_secret})
        server.save()
    server.projects.add(project)
    return server


def get_mcp_server_standalone(company, server_id: str):
    """Fetch a single MCP server, for permission checks (obj=server) and PATCH."""
    from nucleus.models import MCPServer
    return MCPServer.objects.filter(company=company, id=server_id, is_active=True).first()


def update_mcp_server_standalone(company, server_id: str, data: dict):
    server = get_mcp_server_standalone(company, server_id)
    if not server:
        return None
    client_secret = data.pop("client_secret", None)
    for field, value in data.items():
        if value is not None:
            setattr(server, field, value)
    if client_secret:
        server.set_secrets({**server.get_secrets(), "client_secret": client_secret})
    server.save()
    return server


def delete_mcp_server_standalone(company, server_id: str) -> bool:
    from nucleus.models import MCPServer
    server = MCPServer.objects.filter(company=company, id=server_id, is_active=True).first()
    if not server:
        return False
    server.soft_delete()
    return True


def list_agents(company, user):
    from authn.permissions.row_rules import visible_agents
    return visible_agents(user, company).select_related("model", "mcp_server")


def create_agent(company, data: dict):
    """
    Agents are project-owned (see nucleus/models/intelligence.py). The
    `projects` M2M is kept structurally (not converted to a FK), but only
    ever gets exactly one entry -- the project passed in `data['project_id']`
    -- and there's no attach-to-another-project endpoint, so in practice an
    agent never belongs to more than one project.
    """
    from nucleus.models import AIAgent, AIModel, MCPServer, Project
    project_id = data.pop("project_id")
    model_id = data.pop("model_id", None)
    mcp_server_id = data.pop("mcp_server_id", None)

    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise ValueError("Project not found")
    model = AIModel.objects.filter(company=company, id=model_id, is_active=True).first() if model_id else None
    mcp_server = MCPServer.objects.filter(company=company, id=mcp_server_id, is_active=True).first() if mcp_server_id else None
    if not model:
        raise ValueError("AIModel not found")

    # No DB-level per-project uniqueness (see Meta.constraints NOTE on
    # AIAgent) -- checked here instead.
    if AIAgent.objects.filter(company=company, name=data.get("name"), projects=project, is_active=True).exists():
        raise ValueError(f"An agent named '{data.get('name')}' already exists in this project.")

    agent = AIAgent.objects.create(company=company, model=model, mcp_server=mcp_server, **data)
    agent.projects.add(project)
    return agent


def get_agent(company, agent_id: str):
    """Fetch a single agent, for permission checks (obj=agent) and PATCH."""
    from nucleus.models import AIAgent
    return AIAgent.objects.filter(company=company, id=agent_id, is_active=True).first()


def update_agent(company, agent_id: str, data: dict):
    agent = get_agent(company, agent_id)
    if not agent:
        return None
    for field, value in data.items():
        if value is not None:
            setattr(agent, field, value)
    agent.save()
    return agent


def delete_agent(company, agent_id: str) -> bool:
    from nucleus.models import AIAgent
    agent = AIAgent.objects.filter(company=company, id=agent_id, is_active=True).first()
    if not agent:
        return False
    agent.soft_delete()
    return True


def list_mcp_servers(company, ai_model_id: str):
    from nucleus.models import MCPServer, AIAgent
    # MCPServer links to AIAgent which links to AIModel
    return MCPServer.objects.filter(
        company=company,
        agents__model__id=ai_model_id,
        is_active=True,
    ).distinct()


def create_mcp_server(company, ai_model_id: str, data: dict) -> "MCPServer":
    from nucleus.models import MCPServer, AIAgent, AIModel
    model = AIModel.objects.filter(company=company, id=ai_model_id, is_active=True).first()
    if not model:
        raise ValueError("AIModel not found")

    server = MCPServer.objects.create(company=company, **data)

    # Create or update the AIAgent that links model + this MCP server
    AIAgent.objects.create(
        company=company,
        name=f"{model.name} + {server.name}",
        agent_type="internal",
        model=model,
        mcp_server=server,
    )
    return server


def delete_mcp_server(company, ai_model_id: str, server_id: str) -> bool:
    from nucleus.models import MCPServer
    server = MCPServer.objects.filter(
        company=company,
        id=server_id,
        agents__model__id=ai_model_id,
        is_active=True,
    ).first()
    if not server:
        return False
    server.soft_delete()
    return True


# ── Persona ───────────────────────────────────────────────────────────────────

def get_persona_by_mention(project, mention_name: str):
    """
    Look up a Persona by @mention name (case-insensitive), scoped to a single
    project -- personas are project-owned and not visible/mentionable from
    any other project. Used by chat/api.py to detect @PersonaName in messages.
    Returns the Persona with related model and prompt, or None.
    """
    from nucleus.models import Persona
    return (
        Persona.objects.filter(project=project, is_active=True)
        .select_related(
            "prompt",
            "model",
            "identity_user",
            "agent__model",
            "agent__mcp_server",
        )
        .filter(name__iexact=mention_name)
        .first()
    )


def list_personas(project, user):
    """
    Personas are project-owned -- list is always scoped to one project,
    never the whole company. Visibility (who gets to see this project's
    list at all) is handled by visible_personas(), same broad/narrow
    pattern as visible_ai_models/visible_agents/visible_mcp_servers.
    """
    from authn.permissions.row_rules import visible_personas
    return visible_personas(user, project).select_related("prompt", "model", "agent")


def get_persona(company, persona_id: str):
    from nucleus.models import Persona
    return Persona.objects.filter(
        company=company, id=persona_id, is_active=True
    ).select_related("prompt", "model", "agent").first()


def create_persona(company, user, data: dict) -> "Persona":
    from nucleus.models import Persona, AIModel, AIAgent, Project
    from nucleus.models import Prompt, PromptTemplate

    prompt_data = data.pop("prompt")
    project_id = data.pop("project_id")
    model_id = data.pop("model_id", None)
    agent_id = data.pop("agent_id", None)

    project = Project.objects.filter(company=company, id=project_id, is_active=True).first()
    if not project:
        raise ValueError("Project not found")

    # Resolve model or agent
    model = AIModel.objects.filter(company=company, id=model_id, is_active=True).first() if model_id else None
    agent = AIAgent.objects.filter(company=company, id=agent_id, is_active=True).first() if agent_id else None

    if Persona.objects.filter(project=project, name=data.get("name"), is_active=True).exists():
        raise ValueError(f"A persona named '{data.get('name')}' already exists in this project.")

    # Create shadow user for the persona (ensure unique username)
    base_username = f"persona_{data['name'].lower().replace(' ', '_')}"
    username, n = base_username, 1
    while User.objects.filter(username=username).exists():
        username = f"{base_username}_{n}"
        n += 1
    shadow_user = User.objects.create(
        username=username,
        user_type="persona",
        is_active=True,
    )
    # Same identity-level helper real users get on join -- a persona is
    # "the same as a User, just model-backed" (see #148 discussion).
    from authn.services import assign_avatar
    assign_avatar(shadow_user)

    persona = Persona.objects.create(
        company=company,
        project=project,
        created_by=user,
        identity_user=shadow_user,
        model=model,
        agent=agent,
        **data,
    )

    # Create prompt
    template_id = prompt_data.pop("template_id", None)
    template = PromptTemplate.objects.filter(
        company=company, id=template_id
    ).first() if template_id else None

    Prompt.objects.create(
        company=company,
        persona=persona,
        template=template,
        **prompt_data,
    )

    return persona


def patch_persona(company, persona_id: str, data: dict) -> "Persona | None":
    from nucleus.models import Persona, Prompt, PromptTemplate

    persona = Persona.objects.filter(
        company=company, id=persona_id, is_active=True
    ).select_related("prompt").first()
    if not persona:
        return None

    prompt_data = data.pop("prompt", None)

    for field, value in data.items():
        if value is not None:
            setattr(persona, field, value)
    persona.save()

    if prompt_data and hasattr(persona, "prompt"):
        template_id = prompt_data.pop("template_id", None)
        template = None
        if template_id:
            template = PromptTemplate.objects.filter(
                company=company, id=template_id
            ).first()
        for field, value in prompt_data.items():
            if value is not None:
                setattr(persona.prompt, field, value)
        if template:
            persona.prompt.template = template
        persona.prompt.save()

    return persona


def delete_persona(company, persona_id: str) -> bool:
    from nucleus.models import Persona
    import uuid
    persona = Persona.objects.filter(
        company=company, id=persona_id, is_active=True
    ).select_related("identity_user").first()
    if not persona:
        return False
    # Free up name + username so the same persona can be re-created later
    suffix = uuid.uuid4().hex[:8]
    persona.name = f"{persona.name}_deleted_{suffix}"
    persona.save(update_fields=["name"])
    if persona.identity_user:
        persona.identity_user.username = f"deleted_{suffix}"
        persona.identity_user.is_active = False
        persona.identity_user.save(update_fields=["username", "is_active"])
    persona.soft_delete()
    return True


# ── PromptTemplate ────────────────────────────────────────────────────────────

def list_prompt_templates(company):
    from nucleus.models import PromptTemplate
    return PromptTemplate.objects.filter(
        company=company, is_active=True
    ).order_by("-is_featured", "title")


# ── CompanyAIConfig ───────────────────────────────────────────────────────────

def get_ai_config(company):
    from nucleus.models import CompanyAIConfig
    config, _ = CompanyAIConfig.objects.get_or_create(company=company)
    return config


def update_ai_config(company, user, data: dict):
    from nucleus.models import CompanyAIConfig
    config, _ = CompanyAIConfig.objects.get_or_create(company=company)
    for field, value in data.items():
        setattr(config, field, value)
    config.updated_by = user
    config.save()
    return config
