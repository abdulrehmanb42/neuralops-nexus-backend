"""
Chat API — human-to-human messaging + AI trigger (M3 + M7 + M7.1).

Flow:
    POST /messages/
        1. Validate project / channel / topic membership
        2. Save message to DB (sender = authenticated user)
        3. Fire-and-forget async publish to Centrifugo topic:{topic_id}
        4. Fire-and-forget async embed to nexus-ai (M2)
        5. Detect @session / @session close directive (M7.1)
        6. Detect @output_type directive (M7) — strip from message, pass to trigger
        7. Detect ALL @persona mentions (M3 + M7.1)
        8. Apply session routing priority (M7.1):
              (a) @session close                → close session, no AI trigger
              (b) @mentions + @session          → close old, open new session,
                                                  trigger mentioned personas
              (c) @mentions (no @session)       → trigger mentioned only,
                                                  session unchanged
              (d) no @mention, session active   → trigger all session personas
              (e) no @mention, no session       → no AI trigger
        9. Return immediately — React receives the message via WebSocket

    GET /messages/
        Return last 100 messages (history) when a topic is opened.
"""
import asyncio
import logging
import re
from typing import List

logger = logging.getLogger(__name__)

from asgiref.sync import sync_to_async
from ninja import Router
from ninja.errors import HttpError

from authn.auth import SupabaseBearer
from chat.schema import MessageOut, SendMessageIn, SendMessageOut
from chat import services as chat_svc
from workspace import services as ws_svc
from intelligence import services as intel_svc

# Matches @Word — finds ALL @mentions in the message.
# @session and @session close are stripped before this regex runs.
_MENTION_RE = re.compile(r'@([\w]+)')

# Reserved keywords that are never persona names.
_RESERVED = frozenset({
    "session", "close",
    "text", "code", "chart", "html", "table", "diagram", "form", "terminal",
})

router = Router(tags=["Chat"], auth=SupabaseBearer())


# ── Helpers ────────────────────────────────────────────────────────────────────

def _resolve_topic_sync(request, project_id: str, channel_id: str, topic_id: str):
    """Resolve and validate all path params — raises HttpError on any miss."""
    user = request.auth
    company = ws_svc.get_company()
    if not company:
        raise HttpError(503, "Server not initialised.")

    project = ws_svc.get_project(company, user, project_id)
    if not project:
        raise HttpError(404, "Project not found.")

    channel = ws_svc.get_channel(company, project, channel_id)
    if not channel:
        raise HttpError(404, "Channel not found.")

    topic = ws_svc.get_topic(company, project, channel, topic_id)
    if not topic:
        raise HttpError(404, "Topic not found.")

    return company, user, project, channel, topic


_resolve_topic = sync_to_async(_resolve_topic_sync)
_list_messages = sync_to_async(chat_svc.list_messages)
_save_user_message = sync_to_async(chat_svc.save_user_message)
_get_persona_by_mention = sync_to_async(intel_svc.get_persona_by_mention)
_list_messages_sync = sync_to_async(chat_svc.list_messages)
_get_active_session = sync_to_async(chat_svc.get_active_session)
_create_session = sync_to_async(chat_svc.create_session)
_close_session = sync_to_async(chat_svc.close_session)
_save_system_message = sync_to_async(chat_svc.save_system_message)


def _get_session_timeout_sync(company) -> int:
    """Return session_timeout_minutes from company AI config, or default 30."""
    try:
        return company.ai_config.session_timeout_minutes
    except Exception:  # ai_config may not exist yet
        return 30


_get_session_timeout = sync_to_async(_get_session_timeout_sync)


# ── GET /messages/ — load history ─────────────────────────────────────────────

@router.get(
    "/{project_id}/channels/{channel_id}/topics/{topic_id}/messages/",
    response=List[MessageOut],
)
async def list_messages(
    request,
    project_id: str,
    channel_id: str,
    topic_id: str,
):
    """
    Return the last 100 messages in a topic, oldest first.
    Called by React on topic open to populate history.
    """
    await _resolve_topic(request, project_id, channel_id, topic_id)
    return await _list_messages(topic_id)


# ── POST /messages/ — send message ────────────────────────────────────────────

@router.post(
    "/{project_id}/channels/{channel_id}/topics/{topic_id}/messages/",
    response=SendMessageOut,
)
async def send_message(
    request,
    project_id: str,
    channel_id: str,
    topic_id: str,
    payload: SendMessageIn,
):
    """
    Save a human message, broadcast via Centrifugo, embed, and trigger AI if mentioned.

    Both publish and embed are fire-and-forget (asyncio.create_task) so this
    endpoint returns immediately — latency stays low regardless of AI/Centrifugo.
    """
    if not payload.content.strip():
        raise HttpError(400, "Message content cannot be empty.")

    if len(payload.content) > 4000:
        raise HttpError(400, "Message too long (max 4000 characters). Attach large text as a context source.")

    company, user, project, channel, topic = await _resolve_topic(
        request, project_id, channel_id, topic_id
    )

    # 1. Save to DB (original message with @directives intact for display)
    msg = await _save_user_message(
        company=company,
        project=project,
        topic=topic,
        user=user,
        content=payload.content.strip(),
    )

    # 2. Publish to Centrifugo — fire and forget
    centrifugo_channel = chat_svc.topic_channel(topic_id)
    asyncio.create_task(chat_svc.publish_async(centrifugo_channel, msg))

    # 3. Embed to nexus-ai — fire and forget (M2)
    asyncio.create_task(
        chat_svc.embed_message_async(
            message_id=msg["id"],
            company_id=str(company.id),
            sequence=msg["sequence"],
            topic_id=topic_id,
            channel_id=channel_id,
            project_id=project_id,
            sender_id=msg["sender_id"],
            sender_name=msg["sender_name"],
            sender_type=msg["sender_type"],
            content=msg["content"],
            created_at=msg["created_at"],
        )
    )

    # 4. M7.1: Extract @session directive first (before output_type or mention parsing)
    has_session_open, is_session_close, after_session = chat_svc.extract_session_directive(
        payload.content.strip()
    )

    # 5. M7: Extract @output_type directive
    #    e.g. "@Nova show me sales @chart" → output_type="chart", clean="@Nova show me sales"
    output_type, clean_message = chat_svc.extract_output_type(after_session)

    # 6. M7.1: Collect ALL @persona mentions (filter out reserved keywords)
    raw_mentions = _MENTION_RE.findall(clean_message)  # list of names
    mention_names = [n for n in raw_mentions if n.lower() not in _RESERVED]

    # Resolve mentions to Persona objects (parallel)
    mentioned_personas = []
    for name in mention_names:
        # Personas are project-owned -- scoped to this topic's project, not
        # the whole company (see intelligence/services.py:get_persona_by_mention).
        p = await _get_persona_by_mention(project, name)
        if p:
            mentioned_personas.append(p)
            logger.info("[chat/api] mention=%s resolved persona=%s", name, p)

    # 7. M7.1: Apply session routing priority

    if is_session_close:
        # Rule 1: @session close — close session, no AI trigger
        closed = await _close_session(user.id, topic.id)
        logger.warning("[chat/api] session closed user=%s topic=%s found=%s", user.id, topic_id, closed)
        sys_msg = await _save_system_message(
            company=company, project=project, topic=topic,
            content="Session closed.",
        )
        asyncio.create_task(chat_svc.publish_async(
            centrifugo_channel, {**sys_msg, "type": "message"}
        ))

    elif mentioned_personas and has_session_open:
        # Rule 2: @mentions + @session — open new session with mentioned personas
        timeout = await _get_session_timeout(company)
        await _create_session(user, topic, mentioned_personas, timeout)
        persona_names = ", ".join(f"@{p.name}" for p in mentioned_personas)
        logger.warning(
            "[chat/api] session opened personas=%s timeout=%sm",
            [p.name for p in mentioned_personas], timeout,
        )
        sys_msg = await _save_system_message(
            company=company, project=project, topic=topic,
            content=f"Session with {persona_names} opened ({timeout} min). Plain messages will go to them automatically.",
        )
        asyncio.create_task(chat_svc.publish_async(
            centrifugo_channel, {**sys_msg, "type": "message"}
        ))
        # Only trigger personas if there is actual content beyond the @mention
        user_content = _MENTION_RE.sub("", clean_message).strip()
        if user_content:
            await _trigger_personas(mentioned_personas, company, project, topic,
                                     topic_id, msg, clean_message, output_type)

    elif mentioned_personas:
        # Rule 3: @mentions (no @session) — trigger only mentioned, session unchanged
        await _trigger_personas(mentioned_personas, company, project, topic,
                                 topic_id, msg, clean_message, output_type)

    else:
        # Rules 4 + 5: no explicit mention — check session
        active_session = await _get_active_session(user.id, topic.id)
        if active_session:
            # Rule 4: session active — trigger all session personas
            session_personas = list(active_session.personas.all())
            logger.warning(
                "[chat/api] session auto-trigger personas=%s",
                [p.name for p in session_personas],
            )
            await _trigger_personas(session_personas, company, project, topic,
                                     topic_id, msg, clean_message, output_type)
        # Rule 5: no mention, no session — human-only message, nothing to do

    # 8. Return immediately
    return {
        "message": msg,
        "channel": centrifugo_channel,
    }


async def _trigger_personas(
    personas: list,
    company,
    project,
    topic,
    topic_id: str,
    msg: dict,
    clean_message: str,
    output_type: str,
) -> None:
    """
    Fire AI trigger tasks for each persona in parallel.
    Builds history once and spawns one asyncio task per persona.
    Only triggers personas that have a model (source_type=model for now;
    source_type=agent handled in M8).
    """
    if not personas:
        return

    # Build history once (shared across all persona triggers)
    raw_history = await _list_messages_sync(topic_id, limit=20)
    ai_history = []
    for m in raw_history:
        # Skip the message we just saved (sent separately as user_message)
        if m["id"] == msg["id"]:
            continue
        if not m["content"]:
            continue
        role = "user" if m["sender_type"] == "human" else "assistant"
        render_as = m.get("render_as", "text")
        output_type_val = m.get("output_type", "text")
        content = m["content"].strip()
        if role == "assistant":
            _VISUAL_TYPES = {"chart", "table", "diagram", "html", "form"}
            if render_as == "html" and not (
                content.startswith("<!DOCTYPE") or content.startswith("<html")
            ):
                continue
            if output_type_val in _VISUAL_TYPES and render_as == "text":
                continue
        ai_history.append({
            "role": role,
            "content": m["content"],
            "sender_name": m["sender_name"],
        })

    for persona in personas:
        source_type = getattr(persona, "source_type", "model")
        if source_type == "model" and not persona.model:
            logger.info("[chat/api] skipping persona=%s (no model configured)", persona)
            continue
        if source_type == "agent" and not (
            getattr(persona, "agent", None) and persona.agent.model
        ):
            logger.info("[chat/api] skipping persona=%s (agent has no model configured)", persona)
            continue
        asyncio.create_task(
            chat_svc.trigger_ai_response_async(
                company=company,
                project=project,
                topic=topic,
                persona=persona,
                user_message=clean_message,
                history=ai_history,
                topic_id=topic_id,
                output_type=output_type,
            )
        )
