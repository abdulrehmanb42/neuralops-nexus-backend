import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { listMessages, sendMessage, type ApiMessage } from "@/services/chat.service";
import { renameTopic } from "@/services/workspace.service";
import { useCentrifugo } from "./useCentrifugo";
import { useAuthStore } from "@/store/auth.store";
import type { ChatMessage, MessageRenderType, TypingActor } from "@/components/chat/types";

// A typing/thinking actor shown in TypingIndicator, plus:
//  - key: for a persona mid-response, the message id it's standing in for
//    (removed once that message is materialized on first delta/done/error);
//    for a human, `human:${userId}` (removed on an inactivity timeout,
//    since there's no explicit "stopped typing" event -- see #141).
//  - timestamp: stashed so a persona actor materializing into a real
//    ChatMessage on first delta has something to use for it.
type PendingActor = TypingActor & { key: string; timestamp: string };

// How long a human's "is typing" indicator stays up after their last
// keystroke ping, absent any further pings resetting the clock.
const HUMAN_TYPING_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Beep
// ---------------------------------------------------------------------------
function playBeep(): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Centrifugo event shapes
// ---------------------------------------------------------------------------
type HumanMessageEvent = ApiMessage & { type: "message" };

interface AiStartEvent {
  type: "message_start";
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string | null; // #148
  sequence: number;
  created_at: string;
}
interface AiDeltaEvent {
  type: "message_delta";
  id: string;
  delta: string;
}
interface AiDoneEvent {
  type: "message_done";
  id: string;
  content?: string;
  output_type?: string; // M7: e.g. "chart", "text"
  render_as?: string; // M7: e.g. "html", "text", "code", "terminal"
}
interface AiErrorEvent {
  // Sent instead of message_done when nexus-ai's pipeline failed for any
  // reason (persona resolve, history fetch, the LLM call itself, ...) --
  // see chat/services.py:trigger_ai_response_async on the backend. content
  // is always a friendly placeholder, never the raw exception text.
  type: "message_error";
  id: string;
  content?: string;
}
interface UserTypingEvent {
  // Broadcast by chat/api.py's POST .../typing/, called (throttled) from
  // MessageInput.tsx while someone has text in the box. No "stopped
  // typing" counterpart -- the receiving end just lets the indicator
  // expire after HUMAN_TYPING_TIMEOUT_MS of no further pings. See #141.
  type: "user_typing";
  id: string;
  name: string;
  avatar?: string | null;
}

interface SwarmTransitionEvent {
  type: "swarm_transition";
  id: string; // msg_id
  content: string;
  metadata?: {
    transition_type: string;
    from_persona: string;
    to_persona: string;
  };
}

type CentrifugoEvent =
  | HumanMessageEvent
  | AiStartEvent
  | AiDeltaEvent
  | AiDoneEvent
  | AiErrorEvent
  | UserTypingEvent
  | SwarmTransitionEvent;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map render_as string from the API → MessageRenderType used by the frontend.
 * Defaults to "text" for unknown values.
 */
function toRenderType(renderAs: string | undefined): MessageRenderType {
  switch (renderAs) {
    case "html":
    case "code":
    case "terminal":
    case "image":
    case "web":
      return renderAs;
    default:
      return "text";
  }
}

function toUiMessage(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    type: toRenderType(m.render_as),
    output_type: m.output_type,
    message_type: m.message_type,
    content: m.content,
    sender: {
      id: m.sender_id ?? "",
      name: m.sender_name ?? "",
      type: m.sender_type === "persona" ? "agent" : m.sender_type === "system" ? "system" : "human",
      avatar: m.sender_avatar ?? null,
    },
    timestamp: m.created_at,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useTopicMessages(
  projectId: string | null,
  channelId: string | null,
  topicId: string | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingActors, setTypingActors] = useState<PendingActor[]>([]);
  const { subscribe } = useCentrifugo();
  const currentUserId = useAuthStore((s) => s.userId);

  // NOT useState -- read/written from inside the Centrifugo subscribe
  // callback below, whose owning effect doesn't depend on this value (same
  // stale-closure trap typingActorsRef exists to avoid, see below). With
  // useState, setAutoRenamed(true) never actually took effect from the
  // callback's point of view -- it kept reading the value frozen at
  // whatever it was when the subscription was created, so the rename kept
  // re-firing on every single AI response instead of just the first.
  const autoRenamedRef = useRef(false);

  // Read inside the Centrifugo subscribe callback below -- that effect's
  // dependency array doesn't include typingActors, so the state itself
  // would be stale by the second event. Mirrored via effect, same pattern
  // any other event-sourced state here would need.
  const typingActorsRef = useRef<PendingActor[]>([]);
  useEffect(() => {
    typingActorsRef.current = typingActors;
  }, [typingActors]);

  // Per-human-actor expiry timers (see UserTypingEvent above).
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Reset auto-rename flag + any stuck typing indicators when topic changes
  useEffect(() => {
    autoRenamedRef.current = false;
    setTypingActors([]);
    typingTimersRef.current.forEach((t) => clearTimeout(t));
    typingTimersRef.current.clear();
  }, [topicId]);

  // Load history
  useEffect(() => {
    if (!projectId || !channelId || !topicId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    listMessages(projectId, channelId, topicId)
      .then((msgs) => setMessages(msgs.map(toUiMessage)))
      .catch((err) => toast.error(err.message ?? "Failed to load messages"))
      .finally(() => setLoading(false));
  }, [projectId, channelId, topicId]);

  // Centrifugo subscription
  useEffect(() => {
    if (!topicId) return;
    const channel = `topic-${topicId}`;

    const unsub = subscribe(channel, (data) => {
      const event = data as CentrifugoEvent;

      if (!event?.type || !("id" in event)) return;

      if (event.type === "message") {
        // Human or system message
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.id)) return prev;
          // Beep only for real human messages from other users (not system events)
          if (event.sender_type !== "system" && event.sender_id !== currentUserId) playBeep();
          return [...prev, toUiMessage(event)];
        });
        // Whoever just sent a message is done typing -- drop their indicator
        // immediately instead of waiting out the timeout.
        const key = `human:${event.sender_id}`;
        const timer = typingTimersRef.current.get(key);
        if (timer) {
          clearTimeout(timer);
          typingTimersRef.current.delete(key);
        }
        setTypingActors((prev) => prev.filter((a) => a.key !== key));
      } else if (event.type === "user_typing") {
        // A human is actively typing -- ignore our own echo, upsert an
        // actor, and (re)start its expiry timer. No explicit "stopped
        // typing" event exists, so absence of further pings is the signal.
        if (event.id === currentUserId) return;
        const key = `human:${event.id}`;

        setTypingActors((prev) => {
          if (prev.some((a) => a.key === key)) return prev;
          return [
            ...prev,
            {
              id: event.id,
              name: event.name,
              type: "human",
              avatar: event.avatar ?? null,
              key,
              timestamp: new Date().toISOString(),
            },
          ];
        });

        const existing = typingTimersRef.current.get(key);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.set(
          key,
          setTimeout(() => {
            setTypingActors((prev) => prev.filter((a) => a.key !== key));
            typingTimersRef.current.delete(key);
          }, HUMAN_TYPING_TIMEOUT_MS),
        );
      } else if (event.type === "message_start") {
        // AI persona started responding — show a "thinking" indicator
        // (TypingIndicator, driven by typingActors below) instead of an
        // empty bubble. The real message only enters `messages` once the
        // first token (or an immediate done/error) arrives -- see #141.
        playBeep();
        setTypingActors((prev) => {
          if (prev.some((a) => a.key === event.id)) return prev;
          return [
            ...prev,
            {
              id: event.sender_id,
              name: event.sender_name,
              type: "persona",
              avatar: event.sender_avatar ?? null,
              key: event.id,
              timestamp: event.created_at,
            },
          ];
        });
      } else if (event.type === "message_delta") {
        // First token for this message -- materialize it out of its
        // pending typing actor (see message_start above), then clear
        // that actor. Subsequent deltas just append as before.
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.id)) {
            return prev.map((m) =>
              m.id === event.id ? { ...m, content: m.content + event.delta } : m,
            );
          }
          const actor = typingActorsRef.current.find((a) => a.key === event.id);
          return [
            ...prev,
            {
              id: event.id,
              type: "text",
              output_type: "text",
              content: event.delta,
              sender: {
                id: actor?.id ?? "",
                name: actor?.name ?? "",
                type: "agent",
                avatar: actor?.avatar ?? null,
              },
              timestamp: actor?.timestamp ?? new Date().toISOString(),
              isStreaming: true,
            } satisfies ChatMessage,
          ];
        });
        setTypingActors((prev) => prev.filter((a) => a.key !== event.id));
      } else if (event.type === "message_error") {
        // Streaming failed -- stop the cursor, show the friendly message
        // as plain text instead of leaving the placeholder stuck forever.
        // If it failed before any token ever arrived, the message won't be
        // in the list yet (still just a typing actor) -- materialize it
        // directly as an error bubble instead of leaving that stuck.
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.id)) {
            return prev.map((m) =>
              m.id === event.id
                ? {
                    ...m,
                    isStreaming: false,
                    isError: true,
                    type: "text",
                    content: event.content ?? "Something went wrong generating this response.",
                  }
                : m,
            );
          }
          const actor = typingActorsRef.current.find((a) => a.key === event.id);
          return [
            ...prev,
            {
              id: event.id,
              type: "text",
              output_type: "text",
              content: event.content ?? "Something went wrong generating this response.",
              sender: {
                id: actor?.id ?? "",
                name: actor?.name ?? "",
                type: "agent",
                avatar: actor?.avatar ?? null,
              },
              timestamp: actor?.timestamp ?? new Date().toISOString(),
              isStreaming: false,
              isError: true,
            } satisfies ChatMessage,
          ];
        });
        setTypingActors((prev) => prev.filter((a) => a.key !== event.id));
      } else if (event.type === "message_done") {
        // Streaming complete — replace content with clean version + set renderer
        // If no message_delta ever arrived (a very fast/empty reply), the
        // message won't be in the list yet -- materialize it here instead.
        const renderType = toRenderType(event.render_as);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === event.id);
          let updated: ChatMessage[];
          if (exists) {
            updated = prev.map((m) =>
              m.id === event.id
                ? {
                    ...m,
                    isStreaming: false,
                    type: renderType,
                    output_type: event.output_type ?? "text",
                    content: event.content !== undefined ? event.content : m.content,
                  }
                : m,
            );
          } else {
            const actor = typingActorsRef.current.find((a) => a.key === event.id);
            updated = [
              ...prev,
              {
                id: event.id,
                type: renderType,
                output_type: event.output_type ?? "text",
                content: event.content ?? "",
                sender: {
                  id: actor?.id ?? "",
                  name: actor?.name ?? "",
                  type: "agent",
                  avatar: actor?.avatar ?? null,
                },
                timestamp: actor?.timestamp ?? new Date().toISOString(),
                isStreaming: false,
              } satisfies ChatMessage,
            ];
          }
          // Auto-rename: on first AI response, use the human message that
          // actually triggered it -- the most recent human message right
          // before this AI reply -- not just the topic's very first message,
          // which could be unrelated small talk before anyone ever
          // @mentioned a persona.
          if (
            !autoRenamedRef.current &&
            projectId &&
            channelId &&
            topicId &&
            updated.some((m) => m.sender.type === "agent" && m.id === event.id)
          ) {
            const aiIndex = updated.findIndex((m) => m.id === event.id);
            let triggerHuman: ChatMessage | undefined;
            for (let i = aiIndex - 1; i >= 0; i--) {
              if (updated[i].sender.type === "human") {
                triggerHuman = updated[i];
                break;
              }
            }
            if (triggerHuman) {
              // Strip @mentions and output_type markers, trim to 60 chars
              const title =
                triggerHuman.content
                  .replace(/@\w+/g, "")
                  .replace(/@output_type:\w+/g, "")
                  .trim()
                  .slice(0, 60) || "chat";
              autoRenamedRef.current = true;
              renameTopic(projectId, channelId, topicId, title).catch(() => {});
            }
          }
          return updated;
        });
        setTypingActors((prev) => prev.filter((a) => a.key !== event.id));
      } else if (event.type === "swarm_transition") {
        setMessages((prev) => [
          ...prev,
          {
            id: `transition-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: "text",
            content: event.content,
            sender: {
              id: "system",
              name: "System",
              type: "system",
              avatar: null,
            },
            timestamp: new Date().toISOString(),
          } satisfies ChatMessage,
        ]);
      }
    });

    return unsub;
  }, [topicId, subscribe, currentUserId]);

  // Polling fallback — catches messages from other users when WebSocket is slow
  useEffect(() => {
    if (!projectId || !channelId || !topicId) return;
    const poll = async () => {
      try {
        const msgs = await listMessages(projectId, channelId, topicId);
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = msgs.filter((m) => !existingIds.has(m.id));
          if (fresh.length === 0) return prev;
          if (fresh.some((m) => m.sender_id !== currentUserId)) playBeep();
          const merged = [...prev, ...fresh.map(toUiMessage)];
          merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          return merged;
        });
      } catch {
        /* silent */
      }
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [projectId, channelId, topicId, currentUserId]);

  const send = useCallback(
    async (content: string) => {
      if (!projectId || !channelId || !topicId) return;

      try {
        const { message } = await sendMessage(projectId, channelId, topicId, content);
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, toUiMessage(message)];
        });
      } catch (err: unknown) {
        console.error("[useChat] sendMessage failed:", err);
        const msg = err instanceof Error ? err.message : "Failed to send";
        toast.error(msg);
        throw err;
      }
    },
    [projectId, channelId, topicId],
  );

  return { messages, loading, send, typingActors };
}
