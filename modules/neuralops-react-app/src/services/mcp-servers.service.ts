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

export async function patchMCPServer(id: string, input: Partial<MCPServer>): Promise<MCPServer> {
  return apiJson<MCPServer>(`/api/v1/mcp-servers/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMCPServer(id: string): Promise<void> {
  return apiJson<void>(`/api/v1/mcp-servers/${id}/`, { method: "DELETE" });
}

// OAuth2 connect flow (auth_type === "oauth2" servers only). Sends
// window.location.origin -- nucleus signs it into the state param so the
// public callback endpoint (auth=None, no bearer token available) knows
// which origin's window.postMessage() to target on the way back. See
// intelligence/oauth_client.py:build_authorize_url / mcp_oauth_callback.
export async function getMCPOAuthAuthorizeUrl(id: string): Promise<string> {
  const res = await apiJson<{ authorize_url: string }>(
    `/api/v1/mcp-servers/${id}/oauth/authorize/?frontend_origin=${encodeURIComponent(window.location.origin)}`,
  );
  return res.authorize_url;
}
