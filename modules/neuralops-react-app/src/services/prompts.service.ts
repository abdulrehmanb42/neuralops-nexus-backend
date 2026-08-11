import { apiJson } from "./api-client";

export interface ListPromptsResponse {
  prompts: Record<string, string>;
}

export interface PromptContentResponse {
  content: string;
}

export async function listPrompts(): Promise<ListPromptsResponse> {
  return apiJson<ListPromptsResponse>("/api/v1/prompt-templates");
}

export async function getPromptContent(id: string): Promise<PromptContentResponse> {
  return apiJson<PromptContentResponse>(`/api/v1/prompt-templates/${id}`);
}
