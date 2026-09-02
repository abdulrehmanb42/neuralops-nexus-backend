from apps.interfaces.agent import AgentRunner
from typing import AsyncIterator, Sequence
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ToolCallPart,
    TextPartDelta,
    PartDeltaEvent,
    PartStartEvent,
)
from pydantic_ai.capabilities import (
    NativeOrLocalTool,
    WebSearch,
    MCP,
    Thinking,
    ToolSearch,
    WebFetch,
    XSearch,
)
from pydantic_ai_harness import (
    FileSystem,
    Shell,
    Advisor,
    CapabilityCreation,
    SummarizingCompaction,
    DynamicWorkflow,
    LocalStack,
    Memory,
    Planning,
    RepoContext,
    SubAgents,
    SpendLimits,
    Skills,
)
from apps.schemas.trigger import (
    PersonaConfig,
    TriggerJob,
    TriggerSwarmJob,
    AgentEvent,
    AgentEventType,
    NativePydanticAICapabilities,
    ToolCallData,
)


class PydanticAIRunner(AgentRunner):
    _CAPABILITY_REGISTRY = {
        NativePydanticAICapabilities.ADVISOR: Advisor,
        NativePydanticAICapabilities.CAPABILITY_CREATION: CapabilityCreation,
        NativePydanticAICapabilities.COMPACTION: SummarizingCompaction,
        NativePydanticAICapabilities.DYNAMIC_WORKFLOW: DynamicWorkflow,
        NativePydanticAICapabilities.FILESYSTEM: FileSystem,
        NativePydanticAICapabilities.LOCAL_STACK: LocalStack,
        NativePydanticAICapabilities.MCP: MCP,
        NativePydanticAICapabilities.MEMORY: Memory,
        NativePydanticAICapabilities.PLANNING: Planning,
        NativePydanticAICapabilities.REPO_CONTEXT: RepoContext,
        NativePydanticAICapabilities.SHELL: Shell,
        NativePydanticAICapabilities.SKILLS: Skills,
        NativePydanticAICapabilities.SPEND_LIMITS: SpendLimits,
        NativePydanticAICapabilities.SUBAGENTS: SubAgents,
        NativePydanticAICapabilities.THINKING: Thinking,
        NativePydanticAICapabilities.TOOL_APPROVAL: None,
        NativePydanticAICapabilities.TOOL_SEARCH: ToolSearch,
        NativePydanticAICapabilities.WEB_FETCH: WebFetch,
        NativePydanticAICapabilities.WEB_SEARCH: WebSearch,
        NativePydanticAICapabilities.X_SEARCH: XSearch,
    }

    async def run_stream(
        self,
        job: TriggerJob | TriggerSwarmJob,
        messages: Sequence[ModelMessage],
        persona: PersonaConfig,
        tools: list[dict] | None = None,
    ) -> AsyncIterator[AgentEvent]:
        agent = PydanticAIRunner.build_agent(persona)

        # TODO remove!
        yield AgentEvent(
            type=AgentEventType.START,
            id=job.user_message_id,
            persona_id=persona.id,
            persona_name=persona.name,
        )

        try:
            async with agent.run_stream_events(message_history=messages) as events:
                async for event in events:
                    match event:
                        case PartDeltaEvent(delta=TextPartDelta() as text_delta):
                            # TODO
                            yield AgentEvent(
                                type=AgentEventType.DELTA,
                                id=job.user_message_id,
                                delta=text_delta.content_delta,
                            )
                        case PartStartEvent(part=ToolCallPart() as tool_call) if (
                            tool_call.tool_name in []
                        ):
                            ...
                            # TODO
                        case PartStartEvent(part=ToolCallPart() as tool_call):
                            yield AgentEvent(
                                type=AgentEventType.TOOL_CALL_START,
                                id=job.user_message_id,
                                tool_call=ToolCallData(
                                    name=tool_call.tool_name,
                                    args=tool_call.args_as_dict(),
                                ),
                            )
                        case _:
                            pass

                    # TODO
                    yield AgentEvent(
                        type=AgentEventType.END,
                        id=job.user_message_id,
                    )
        except Exception as e:
            yield AgentEvent(
                type=AgentEventType.ERROR,
                id=job.user_message_id,
                error=str(e),
                error_code="sorry",
            )

    @staticmethod
    def build_agent(persona: PersonaConfig) -> Agent:
        return Agent(
            persona.model.model_id,
            instructions=persona.system_prompt,
            capabilities=PydanticAIRunner._resolve_capabilities(
                PersonaConfig.capabilites
            ),
        )

    @classmethod
    def _resolve_capabilities(
        cls, capabilities: list[NativePydanticAICapabilities]
    ) -> list[NativeOrLocalTool]:
        return [cls._CAPABILITY_REGISTRY[capability] for capability in capabilities]
