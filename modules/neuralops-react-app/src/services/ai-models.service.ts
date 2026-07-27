import { apiJson } from "./api-client";
import type { AIModel } from "@/types";

export async function listAIModels(): Promise<AIModel[]> {
  return apiJson<AIModel[]>("/api/v1/ai-models/");
}

export async function createAIModel(input: Partial<AIModel>): Promise<AIModel> {
  return apiJson<AIModel>("/api/v1/ai-models/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteAIModel(id: string): Promise<void> {
  return apiJson<void>(`/api/v1/ai-models/${id}/`, { method: "DELETE" });
}
