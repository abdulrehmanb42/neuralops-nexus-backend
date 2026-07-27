import { apiJson } from "./api-client";
import type { Persona } from "@/types";

export async function listPersonas(): Promise<Persona[]> {
  return apiJson<Persona[]>("/api/v1/personas/");
}

export async function createPersona(input: Partial<Persona>): Promise<Persona> {
  return apiJson<Persona>("/api/v1/personas/", {
    method: "POST",
    body: JSON.stringify(input),
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
