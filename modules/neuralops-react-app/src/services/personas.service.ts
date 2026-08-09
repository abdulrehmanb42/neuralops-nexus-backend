import { apiJson } from "./api-client";
import type { Persona } from "@/types";

// Personas are project-owned (see DECISIONS.md #1, #92) -- both endpoints
// require project_id. listPersonas() returns [] early instead of calling
// the API with an empty project_id, which the backend would 422 on.
export async function listPersonas(projectId?: string | null): Promise<Persona[]> {
  if (!projectId) return [];
  return apiJson<Persona[]>(`/api/v1/personas/?project_id=${encodeURIComponent(projectId)}`);
}

export async function createPersona(projectId: string, input: Partial<Persona>): Promise<Persona> {
  return apiJson<Persona>("/api/v1/personas/", {
    method: "POST",
    body: JSON.stringify({ ...input, project_id: projectId }),
  });
}

export async function patchPersona(id: string, input: Partial<Persona>): Promise<Persona> {
  return apiJson<Persona>(`/api/v1/personas/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deletePersona(id: string): Promise<void> {
  return apiJson<void>(`/api/v1/personas/${id}/`, { method: "DELETE" });
}
