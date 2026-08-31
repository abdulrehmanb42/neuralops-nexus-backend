import { apiJson } from "./client";
import type { WireMessage } from "@/lib/realtime/events";

const topicPath = (p: string, c: string, t: string) => `/api/v1/projects/${p}/channels/${c}/topics/${t}`;

export function listMessages(projectId: string, channelId: string, topicId: string, beforeSequence?: number, limit = 100) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (beforeSequence !== undefined) qs.set("before_sequence", String(beforeSequence));
  return apiJson<WireMessage[]>(`${topicPath(projectId, channelId, topicId)}/messages/?${qs}`);
}

export function sendMessage(projectId: string, channelId: string, topicId: string, content: string) {
  return apiJson<{ message: WireMessage; channel: string }>(`${topicPath(projectId, channelId, topicId)}/messages/`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// Fire-and-forget presence ping; failures are irrelevant.
export function sendTyping(projectId: string, channelId: string, topicId: string) {
  return apiJson<{ ok: boolean }>(`${topicPath(projectId, channelId, topicId)}/typing/`, { method: "POST" }).catch(() => undefined);
}

export const MAX_MESSAGE_LENGTH = 4000;
