import { apiJson } from "./client";

export interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  // The requesting user's PROJECT-scope role names (display gating only).
  channels: Channel[];
}

export interface Topic {
  id: string;
  title: string;
  slug: string;
  channel_id: string;
  project_id: string;
  has_unread?: boolean;
  unread_count?: number;
}

export const listProjects = () => apiJson<Project[]>("/api/v1/projects/");

export const createProject = (name: string, description?: string) =>
  apiJson<Project>("/api/v1/projects/", { method: "POST", body: JSON.stringify({ name, description: description || null }) });

export const createChannel = (projectId: string, name: string, description?: string) =>
  apiJson<Channel>(`/api/v1/projects/${projectId}/channels/`, {
    method: "POST",
    body: JSON.stringify({ name, description: description || null }),
  });

export const listTopics = (projectId: string, channelId: string) =>
  apiJson<Topic[]>(`/api/v1/projects/${projectId}/channels/${channelId}/topics/`);

export const createTopic = (projectId: string, channelId: string, title: string) =>
  apiJson<Topic>(`/api/v1/projects/${projectId}/channels/${channelId}/topics/`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const renameTopic = (projectId: string, channelId: string, topicId: string, title: string) =>
  apiJson<Topic>(`/api/v1/projects/${projectId}/channels/${channelId}/topics/${topicId}/`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const markTopicRead = (projectId: string, channelId: string, topicId: string) =>
  apiJson<{ ok: boolean }>(`/api/v1/projects/${projectId}/channels/${channelId}/topics/${topicId}/read/`, { method: "POST" });

// Topics are never named by users: auto-title as chat#N (hard product rule).
// N = max existing chat#N + 1 — a plain count collides after archiving.
export const nextTopicTitle = (existingTitles: string[]) => {
  let max = 0;
  for (const t of existingTitles) {
    const m = /^chat#(\d+)$/.exec(t.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `chat#${max + 1}`;
};

// Soft-deletes (server: BaseModel.soft_delete — reversible by an admin).
export const archiveProject = (projectId: string) =>
  apiJson<{ ok: boolean; message: string }>(`/api/v1/projects/${projectId}/`, { method: "DELETE" });

export const archiveChannel = (projectId: string, channelId: string) =>
  apiJson<{ ok: boolean; message: string }>(`/api/v1/projects/${projectId}/channels/${channelId}/archive/`, { method: "POST" });

export const archiveTopic = (projectId: string, channelId: string, topicId: string) =>
  apiJson<{ ok: boolean; message: string }>(`/api/v1/projects/${projectId}/channels/${channelId}/topics/${topicId}/archive/`, { method: "POST" });
