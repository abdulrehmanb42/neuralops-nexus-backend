import { apiJson } from "./client";

export interface ContextSource {
  id: string;
  topic_id: string;
  type: "file" | "web";
  name: string;
  url: string | null;
  collection_id: string;
  status: "pending" | "ready" | "error";
  error: string | null;
  created_at: string;
}

export interface ContextPanelItem {
  id: string;
  label: string;
  deletable: boolean;
  metadata: Record<string, unknown>;
}

export interface ContextPanelGroup {
  directive: string;
  label: string;
  icon: string;
  can_delete_source: boolean;
  can_delete_items: boolean;
  items: ContextPanelItem[];
}

// NOTE: context routes address topics WITHOUT the channel segment (server quirk).
export function attachContextFile(projectId: string, topicId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiJson<ContextSource>(`/api/v1/projects/${projectId}/topics/${topicId}/context-sources/file/`, {
    method: "POST",
    body,
  });
}

export function attachContextWeb(projectId: string, topicId: string, url: string, name?: string) {
  return apiJson<ContextSource>(`/api/v1/projects/${projectId}/topics/${topicId}/context-sources/web/`, {
    method: "POST",
    body: JSON.stringify({ url, name }),
  });
}

// The panel is a generic tree of groups (Files, Chat History, …) built by the
// server's provider registry — the UI renders it without type knowledge.
export function fetchContextPanel(projectId: string, topicId: string) {
  return apiJson<ContextPanelGroup[]>(`/api/v1/projects/${projectId}/topics/${topicId}/context-panel/`);
}

export function deleteContextPanelItems(projectId: string, topicId: string, items: { directive: string; id: string }[]) {
  return apiJson<{ ok: boolean }>(`/api/v1/projects/${projectId}/topics/${topicId}/context-panel/items/`, {
    method: "DELETE",
    body: JSON.stringify({ items }),
  });
}
