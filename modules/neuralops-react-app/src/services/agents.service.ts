import { apiJson } from "./api-client";
import type { Agent } from "@/types";

// GET is company-wide (row-visibility), no project_id needed. POST is
// project-owned at creation -- same pattern as Persona/MCPServer -- and
// requires project_id or the backend 422s ("Field required").
export async function listAgents(): Promise<Agent[]> {
  return apiJson<Agent[]>("/api/v1/agents/");
}

export async function getAgent(id: string): Promise<Agent> {
  return apiJson<Agent>(`/api/v1/agents/${id}/`);
}

export async function createAgent(projectId: string, input: Partial<Agent>): Promise<Agent> {
  return apiJson<Agent>("/api/v1/agents/", {
    method: "POST",
    body: JSON.stringify({ ...input, project_id: projectId }),
  });
}

export async function patchAgent(id: string, input: Partial<Agent>): Promise<Agent> {
  return apiJson<Agent>(`/api/v1/agents/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return apiJson<void>(`/api/v1/agents/${id}/`, { method: "DELETE" });
}
