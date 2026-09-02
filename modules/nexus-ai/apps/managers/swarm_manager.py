import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, AsyncIterator, TypedDict

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph.message import add_messages
from langgraph.graph.state import StateGraph
from langgraph.types import Command

from apps.factories.context_source import ContextSourceFactory
from apps.interfaces.agent import AgentRunner
from apps.interfaces.embedding import EmbeddingModel
from apps.interfaces.vectorstore import VectorStore
from apps.managers import nucleus_client
from apps.managers.prompt_builder import PromptBuilder
from apps.output_types import OutputTypeRegistry
from apps.output_types.markers import parse_output_markers
from apps.schemas.trigger import (
    AgentEvent,
    HistoryMessage,
    TriggerSwarmJob,
    AgentEventType,
)

log = logging.getLogger(__name__)


class SwarmState(TypedDict):
    # Standard LangGraph message append
    messages: Annotated[list[BaseMessage], add_messages]

    # State tracking
    active_persona_id: str
    stack: list[str]

    # Passed context
    job: TriggerSwarmJob
    persistent_history: list[HistoryMessage]
    context_chunks: list[Any]
    output_instruction: str | None

    # Track complete full-text response for marker parsing
    agent_response_content: list[str]


def build_tools(personas: list[list[str]], active_persona_id: str) -> list[dict]:
    """Dynamically build Swarm routing tools based on active persona."""
    names = [persona[1] for persona in personas if persona[0] != active_persona_id]
    descriptions = "\n".join(
        [
            f"- {persona[1]}:{persona[2]}"
            for persona in personas
            if persona[0] != active_persona_id
        ]
    )
    return [
        {
            "type": "function",
            "function": {
                "name": "handoff_task",
                "description": f"Transfer control to a specialized persona.\n{descriptions}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reasoning": {"type": "string"},
                        "target_persona": {"type": "string", "enum": names},
                        "instructions": {"type": "string"},
                    },
                    "required": ["reasoning", "target_persona", "instructions"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delegate_task",
                "description": f"Delegate task to a specialized persona, and take back control once done\n{descriptions}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reasoning": {"type": "string"},
                        "target_persona": {"type": "string", "enum": names},
                        "instructions": {"type": "string"},
                    },
                    "required": ["reasoning", "target_persona", "instructions"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "continue_work",
                "description": "Grant yourself another turn without waiting for the user.",
                "parameters": {
                    "type": "object",
                    "properties": {"reasoning": {"type": "string"}},
                    "required": ["reasoning"],
                },
            },
        },
    ]


async def universal_agent_node(state: SwarmState, config: RunnableConfig) -> Command:
    active_id = state["active_persona_id"]
    deps = config.get("configurable", {})
    runner: AgentRunner = deps["runner"]
    prompt_builder = PromptBuilder()
    job: TriggerSwarmJob = state["job"]

    sub_msg_id = str(uuid.uuid4())

    await adispatch_custom_event(
        "agent_event",
        AgentEvent(
            type=AgentEventType.START,
            id=sub_msg_id,
            persona_id=active_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        ).model_dump(),
        config=config,
    )

    persona_config = await nucleus_client.resolve_persona(active_id)
    is_delegated = len(state["stack"]) > 1

    injected_tools = [] if is_delegated else build_tools(job.personas, active_id)

    # Conditionally warn agents about output format vs tool calls
    current_output_instruction = state["output_instruction"]
    if current_output_instruction and injected_tools:
        current_output_instruction = (
            f"{current_output_instruction}\n\n"
            "CRITICAL: ONLY apply the formatting above if you are providing the FINAL direct answer to the user. "
            "If your next action is to call a tool, IGNORE the formatting."
        )

    # Build prompt using the proper history format expected by PromptBuilder
    messages = prompt_builder.build(
        job=job,
        persona=persona_config,
        history=state["persistent_history"],
        context_chunks=state["context_chunks"],
        output_type_instruction=current_output_instruction,
        swarm_mode=True,
    )

    agent_response_content = []
    triggered_tool = None

    # Let the existing AgentRunner handle litellm + MCP tools, and proxy its events to LangGraph!
    async for event in runner.run_stream(
        job=job,
        messages=messages,
        persona=persona_config,
        tools=injected_tools,
    ):
        event.id = sub_msg_id

        if event.type == "message_delta" and event.delta:
            agent_response_content.append(event.delta)

        # Dispatch real-time SSE events immediately
        await adispatch_custom_event("agent_event", event.model_dump(), config=config)

        if event.type == "tool_call_start" and event.tool_call.name in [
            "handoff_task",
            "delegate_task",
            "continue_work",
        ]:
            triggered_tool = event.tool_call
            break

    # Parse standard text response for markers if no swarm transition
    if not triggered_tool:
        raw_hop = "".join(agent_response_content)
        clean_hop, marker_type, embed_description = parse_output_markers(raw_hop)

        # In a real impl, fetch default render_as from OutputTypeRegistry
        final_type = marker_type or "text"
        final_render_as = "text"

        await adispatch_custom_event(
            "agent_event",
            AgentEvent(
                type="message_done",
                id=sub_msg_id,
                content=clean_hop,
                output_type=final_type,
                render_as=final_render_as,
                embed_description=embed_description,
            ).model_dump(),
            config=config,
        )

    # Handle state transitions based on the caught tool call
    if triggered_tool:
        name = triggered_tool.name
        args = triggered_tool.args
        reasoning = args.get("reasoning", "")

        if name == "handoff_task":
            target = args.get("target_persona")
            text = f"Handing off to @{target}...\n\n*Reasoning:* {reasoning}"
            await adispatch_custom_event(
                "agent_event",
                AgentEvent(
                    type="swarm_transition", id=sub_msg_id, content=text
                ).model_dump(),
                config=config,
            )
            return Command(
                goto="universal_agent_node",
                update={
                    "active_persona_id": next(
                        p[0] for p in job.personas if p[1] == target
                    )
                },
            )

        elif name == "delegate_task":
            target = args.get("target_persona")
            text = f"Delegating to @{target}...\n\n*Reasoning:* {reasoning}"
            await adispatch_custom_event(
                "agent_event",
                AgentEvent(
                    type="swarm_transition", id=sub_msg_id, content=text
                ).model_dump(),
                config=config,
            )
            target_id = next(p[0] for p in job.personas if p[1] == target)
            return Command(
                goto="universal_agent_node",
                update={
                    "active_persona_id": target_id,
                    "stack": state["stack"] + [target_id],
                },
            )

        elif name == "continue_work":
            text = f"Continuing work...\n\n*Reasoning:* {reasoning}"
            await adispatch_custom_event(
                "agent_event",
                AgentEvent(
                    type="swarm_transition", id=sub_msg_id, content=text
                ).model_dump(),
                config=config,
            )
            return Command(goto="universal_agent_node", update={})

    # If stack is deep, automatically return control
    if len(state["stack"]) > 1:
        popped_stack = state["stack"][:-1]
        parent_id = popped_stack[-1]
        await adispatch_custom_event(
            "agent_event",
            AgentEvent(
                type="swarm_transition", id=sub_msg_id, content="Returning control..."
            ).model_dump(),
            config=config,
        )
        return Command(
            goto="universal_agent_node",
            update={"active_persona_id": parent_id, "stack": popped_stack},
        )

    return Command(goto="__end__", update={})


class AgenticSwarmManager:
    def __init__(
        self,
        runner: AgentRunner,
        embedder: EmbeddingModel,
        store: VectorStore,
    ) -> None:
        self.runner = runner
        self.embedder = embedder
        self.store = store
        self.graph = self._build_graph()

    def _build_graph(self) -> Any:
        workflow = StateGraph(SwarmState)
        workflow.add_node("universal_agent_node", universal_agent_node)
        workflow.set_entry_point("universal_agent_node")
        return workflow.compile()

    async def run(self, job: TriggerSwarmJob) -> AsyncIterator[AgentEvent]:
        history = await nucleus_client.fetch_history(
            job.topic_id, exclude_message_id=job.user_message_id
        )

        initial_state: SwarmState = {
            "messages": [],
            "active_persona_id": job.personas[0][0],
            "stack": [job.personas[0][0]],
            "job": job,
            "persistent_history": history,
            "context_chunks": [],  # Populate via ContextSourceFactory as before
            "output_instruction": None,
            "agent_response_content": [],
        }

        config = {"configurable": {"runner": self.runner}}

        async for stream_event in self.graph.astream_events(
            initial_state, config=config, version="v2"
        ):
            if (
                stream_event["event"] == "on_custom_event"
                and stream_event["name"] == "agent_event"
            ):
                yield AgentEvent(**stream_event["data"])
