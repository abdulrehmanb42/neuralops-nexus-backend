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
        Run the persona via litellm + FastMCPClient tool loop.

        Bypasses pydantic-ai Agent entirely — uses litellm directly (same as
        the fast path) so model routing works identically. FastMCPClient is
        used only to connect to MCP servers and execute tool calls.

        Loop: call LLM (non-stream) → if tool_calls → execute via MCP → repeat
              → final answer → yield as message_delta.
        """
        import contextlib
        import json
        from pydantic_ai.mcp import FastMCPClient

        model_config = job.persona.model
        current_messages = list(messages)
        full_response = ""
        t0 = time.monotonic()
        status = "success"
        error_msg = None

        # Build MCP transport configs
        client_configs = []
        for s in job.persona.mcp_servers:
            if s.transport == "stdio":
                cmd_parts = (s.command or "").split()
                if cmd_parts:
                    client_configs.append({"command": cmd_parts[0], "args": cmd_parts[1:]})
            else:  # http | sse | streamable-http
                if s.url:
                    client_configs.append(s.url)

        try:
            async with contextlib.AsyncExitStack() as stack:
                # Open MCP connections and collect available tools
                all_tools: list[dict] = []
                tool_client_map: dict = {}

                for cfg in client_configs:
                    client = await stack.enter_async_context(FastMCPClient(cfg))
                    for t in await client.list_tools():
                        all_tools.append({
                            "type": "function",
                            "function": {
                                "name": t.name,
                                "description": t.description or "",
                                "parameters": t.inputSchema or {"type": "object", "properties": {}},
                            },
                        })
                        tool_client_map[t.name] = client

                # Agentic tool-calling loop (max 10 rounds)
                for _ in range(10):
                    kwargs = _build_litellm_kwargs(model_config, current_messages)
                    kwargs["stream"] = False
                    if all_tools:
                        kwargs["tools"] = all_tools

                    response = await litellm.acompletion(**kwargs)
                    msg = response.choices[0].message
                    tool_calls = getattr(msg, "tool_calls", None) or []

                    if not tool_calls:
                        # No more tool calls — stream the final answer
                        final_kwargs = _build_litellm_kwargs(model_config, current_messages)
                        final_response = await litellm.acompletion(**final_kwargs)
                        async for chunk in final_response:
                            delta = chunk.choices[0].delta.content or ""
                            if delta:
                                full_response += delta
                                yield AgentEvent(
                                    type="message_delta",
                                    id=job.msg_id,
                                    delta=delta,
                                )
                        break

                    # Append assistant message with tool calls
                    current_messages.append({
                        "role": "assistant",
                        "content": msg.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                },
                            }
                            for tc in tool_calls
                        ],
                    })

                    # Execute each tool via MCP
                    for tc in tool_calls:
                        client = tool_client_map.get(tc.function.name)
                        if client is None:
                            content = f"Tool '{tc.function.name}' not found."
                        else:
                            try:
                                args = json.loads(tc.function.arguments or "{}")
                                result = await client.call_tool(tc.function.name, args)
                                items = result if isinstance(result, list) else getattr(result, "content", [result])
                                content = "\n".join(
                                    item.text if hasattr(item, "text") else str(item)
                                    for item in items
                                )
                            except Exception as exc:
                                content = f"Tool error: {exc}"

                        current_messages.append({
                            "role": "tool",
                            "content": content,
                            "tool_call_id": tc.id,
                        })

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


def _build_pydantic_model(model_config, settings):
    """
    Map a litellm-convention model_id to the correct pydantic-ai model.

    LiteLLMProvider in pydantic-ai 2.x requires a running LiteLLM proxy server;
    it does NOT do in-process routing. We detect the provider from the model_id
    prefix (e.g. "anthropic/", "openai/") and use native pydantic-ai providers.
    """
    model_id: str = model_config.model_id
    api_key: str | None = model_config.api_key or None

    # Local runtime (Ollama / llama.cpp / LM Studio) — OpenAI-compatible API
    if model_config.provider == "local":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider
        return OpenAIChatModel(
            model_id,
            provider=OpenAIProvider(
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                api_key="local",
            ),
        )

    # Parse litellm prefix: "anthropic/claude-haiku" → ("anthropic", "claude-haiku")
    if "/" in model_id:
        prefix, bare_model = model_id.split("/", 1)
    else:
        prefix, bare_model = "openai", model_id

    if prefix == "anthropic":
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider
        return AnthropicModel(
            bare_model,
            provider=AnthropicProvider(api_key=api_key) if api_key else AnthropicProvider(),
        )

    # openai / azure / any OpenAI-compatible provider
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider
    return OpenAIChatModel(
        bare_model,
        provider=OpenAIProvider(api_key=api_key) if api_key else OpenAIProvider(),
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
