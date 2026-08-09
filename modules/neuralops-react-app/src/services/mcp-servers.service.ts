import { apiJson } from "./api-client";
import type { MCPServer } from "@/types";

// GET is company-wide (row-visibility), no project_id needed. POST is
// project-owned at creation -- same pattern as Persona/Agent -- and
// requires project_id or the backend 422s ("Field required").
export async function listMCPServers(): Promise<MCPServer[]> {
  return apiJson<MCPServer[]>("/api/v1/mcp-servers/");
}

export async function createMCPServer(
  projectId: string,
  input: Partial<MCPServer>,
): Promise<MCPServer> {
  return apiJson<MCPServer>("/api/v1/mcp-servers/", {
    method: "POST",
    body: JSON.stringify({ ...input, project_id: projectId }),
  });
}

export async function patchMCPServer(
  id: string,
  input: Partial<MCPServer>,
): Promise<MCPServer> {
  return apiJson<MCPServer>(`/api/v1/mcp-servers/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMCPServer(id: string): Promise<void> {
  return apiJson<void>(`/api/v1/mcp-servers/${id}/`, { method: "DELETE" });
}
