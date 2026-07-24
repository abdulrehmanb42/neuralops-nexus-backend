"""
LiteLLM-based AgentRunner implementation.

Uses litellm.acompletion() directly for all providers — simpler and more
reliable than pydantic-ai model wrappers for the streaming use case.

Model routing via model_id prefix (LiteLLM convention):
    "openai/gpt-4o-mini"                    → OpenAI
    "anthropic/claude-haiku-4-5-20251001"   → Anthropic
    "azure/gpt-4"                            → Azure OpenAI
    "ollama/llama3"                          → Ollama (provider=local)

For M8 MCP integration: wrap with pydantic-ai Agent + mcp_servers here only.
"""
from __future__ import annotations

import logging
import time
from typing import AsyncIterator

import httpx
import litellm

from apps.interfaces.agent import AgentRunner
from apps.schemas.trigger import TriggerJob, AgentEvent, ModelConfig
from apps.core.config import settings

# Suppress litellm's verbose logging
litellm.suppress_debug_info = True

log = logging.getLogger(__name__)


class PydanticAIRunner(AgentRunner):
    """
    Streams LLM responses via LiteLLM (plain model) or pydantic-ai Agent (MCP).
    Receives the fully-assembled messages list from PromptBuilder and
    yields message_delta events.

    Routing:
        job.persona.mcp_servers is empty  → LiteLLM direct streaming (fast path)
        job.persona.mcp_servers non-empty → pydantic-ai Agent with MCP tools
    """

    async def run_stream(
        self,
        job: TriggerJob,
        messages: list[dict],
    ) -> AsyncIterator[AgentEvent]:
        # M8: persona has MCP servers — delegate to pydantic-ai agent runner
        if job.persona.mcp_servers:
            async for event in self._run_with_mcp(job, messages):
                yield event
            return

        # Default: LiteLLM direct streaming (unchanged from pre-M8)
        model_config = job.persona.model
        kwargs = _build_litellm_kwargs(model_config, messages)

        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0
        status = "success"
        error_msg = None
        t0 = time.monotonic()

        try:
            response = await litellm.acompletion(**kwargs)
            async for chunk in response:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full_response += delta
                    yield AgentEvent(
                        type="message_delta",
                        id=job.msg_id,
                        delta=delta,
                    )
                # Accumulate usage from the final chunk (some providers send it there)
                if hasattr(chunk, "usage") and chunk.usage:
                    prompt_tokens = getattr(chunk.usage, "prompt_tokens", 0) or 0
                    completion_tokens = getattr(chunk.usage, "completion_tokens", 0) or 0
        except Exception as exc:
            status = "error"
            error_msg = str(exc)
            log.error("[runner] litellm error for job %s: %s", job.job_id, exc)
            raise
        finally:
            latency_ms = int((time.monotonic() - t0) * 1000)
            await _post_ai_request_log(
                job=job,
                messages=messages,
                response=full_response,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                latency_ms=latency_ms,
                status=status,
                error=error_msg,
            )

    async def _run_with_mcp(
        self,
        job: TriggerJob,
        messages: list[dict],
    ) -> AsyncIterator[AgentEvent]:
        """
        Run the persona via pydantic-ai Agent with MCP tool servers.

        History conversion (OpenAI → pydantic-ai):
            system message  → agent system_prompt kwarg
            user messages   → ModelRequest(UserPromptPart)
            assistant msgs  → ModelResponse(TextPart)
        The final user message becomes the prompt passed to agent.run_stream().
        """
        from pydantic_ai import Agent
        from pydantic_ai.models.litellm import LiteLLMModel
        from pydantic_ai.messages import (
            ModelRequest, ModelResponse,
            UserPromptPart, TextPart,
        )

        # Build MCP server clients
        mcp_server_clients = []
        for s in job.persona.mcp_servers:
            if s.transport == "stdio":
                from pydantic_ai.mcp import MCPServerStdio
                cmd_parts = (s.command or "").split()
                if cmd_parts:
                    mcp_server_clients.append(
                        MCPServerStdio(cmd_parts[0], args=cmd_parts[1:])
                    )
            else:  # http | sse | websocket
                from pydantic_ai.mcp import MCPServerStreamableHTTP
                if s.url:
                    mcp_server_clients.append(MCPServerStreamableHTTP(s.url))

        # Build LiteLLM model
        model_config = job.persona.model
        model_kwargs: dict = {}
        if model_config.provider == "local":
            model_kwargs["base_url"] = f"{settings.OLLAMA_BASE_URL}/v1"
            model_kwargs["api_key"] = "local"
        elif model_config.api_key:
            model_kwargs["api_key"] = model_config.api_key

        pydantic_model = LiteLLMModel(
            model_name=model_config.model_id, **model_kwargs
        )

        # Split system prompt out of the messages list
        system_prompt = ""
        remainder: list[dict] = []
        for m in messages:
            if m["role"] == "system" and not system_prompt:
                system_prompt = m["content"]
            else:
                remainder.append(m)

        # Convert history to pydantic-ai ModelMessage format
        # All turns except the final user message become message_history
        pydantic_history: list = []
        for m in remainder[:-1]:
            if m["role"] == "user":
                pydantic_history.append(
                    ModelRequest(parts=[UserPromptPart(content=m["content"])])
                )
            elif m["role"] == "assistant":
                pydantic_history.append(
                    ModelResponse(parts=[TextPart(content=m["content"])])
                )

        current_message = remainder[-1]["content"] if remainder else ""

        agent: Agent = Agent(
            model=pydantic_model,
            system_prompt=system_prompt,
            mcp_servers=mcp_server_clients,
        )

        full_response = ""
        t0 = time.monotonic()
        status = "success"
        error_msg = None

        try:
            async with agent.run_mcp_servers():
                async with agent.run_stream(
                    current_message,
                    message_history=pydantic_history,
                ) as result:
                    async for delta in result.stream_text(delta=True):
                        full_response += delta
                        yield AgentEvent(
                            type="message_delta",
                            id=job.msg_id,
                            delta=delta,
                        )
        except Exception as exc:
            status = "error"
            error_msg = str(exc)
            log.error("[runner] mcp error for job %s: %s", job.job_id, exc)
            raise
        finally:
            latency_ms = int((time.monotonic() - t0) * 1000)
            await _post_ai_request_log(
                job=job,
                messages=messages,
                response=full_response,
                prompt_tokens=0,
                completion_tokens=0,
                latency_ms=latency_ms,
                status=status,
                error=error_msg,
            )


async def _post_ai_request_log(
    *,
    job: TriggerJob,
    messages: list[dict],
    response: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    status: str,
    error: str | None,
) -> None:
    """Fire-and-forget POST to nucleus internal API to persist the AI request log."""
    url = f"{settings.NEXUS_NUCLEUS_URL}/api/v1/internal/ai-request-logs/"
    payload = {
        "job_id": job.job_id,
        "msg_id": job.msg_id,
        "persona_id": str(job.persona.id) if job.persona else None,
        "model_id": job.persona.model.model_id if job.persona else "",
        "provider": job.persona.model.provider if job.persona else "",
        "prompt": messages,
        "response": response,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "latency_ms": latency_ms,
        "status": status,
        "error": error,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as exc:
        log.warning("[runner] failed to post AI request log: %s", exc)


def _build_litellm_kwargs(model_config: ModelConfig, messages: list[dict]) -> dict:
    """Build kwargs dict for litellm.acompletion()."""
    kwargs: dict = {
        "model": model_config.model_id,
        "messages": messages,
        "stream": True,
        "max_tokens": model_config.max_tokens,
        "temperature": model_config.temperature,
    }

    if model_config.provider == "local":
        # Local runtime (Ollama, llama.cpp, LM Studio) — OpenAI-compatible API
        kwargs["api_base"] = f"{settings.OLLAMA_BASE_URL}/v1"
        kwargs["api_key"] = "local"
    elif model_config.api_key:
        kwargs["api_key"] = model_config.api_key

    return kwargs
