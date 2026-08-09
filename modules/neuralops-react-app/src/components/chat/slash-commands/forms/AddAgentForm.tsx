import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createAgent } from "@/services/agents.service";
import { listAIModels } from "@/services/ai-models.service";
import { listMCPServers } from "@/services/mcp-servers.service";
import { FormDialog, Field } from "./shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AIModel, MCPServer } from "@/types";

const NO_MCP = "__none__";

interface FormState {
  name: string;
  description: string;
  model_id: string;
  mcp_server_id: string;
  system_prompt: string;
  agent_type: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  model_id: "",
  mcp_server_id: NO_MCP,
  system_prompt: "",
  agent_type: "internal",
};

export function AddAgentForm({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
}) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [mcps, setMcps] = useState<MCPServer[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listAIModels().then(setModels).catch(() => {});
    listMCPServers().then(setMcps).catch(() => {});
  }, [open]);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function setSel(key: keyof FormState) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.model_id) return;
    if (!projectId) {
      toast.error("Open a project first -- agents belong to a project.");
      return;
    }
    setSaving(true);
    try {
      await createAgent(projectId, {
        name: form.name,
        description: form.description || undefined,
        model_id: form.model_id,
        mcp_server_id:
          form.mcp_server_id === NO_MCP ? undefined : form.mcp_server_id,
        system_prompt: form.system_prompt || undefined,
        agent_type: form.agent_type,
      });
      toast.success(`Agent "${form.name}" created`);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create agent",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Create Agent" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Name *">
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="ERP Agent"
            autoFocus
          />
        </Field>

        <Field label="AI Model *">
          <Select value={form.model_id} onValueChange={setSel("model_id")}>
            <SelectTrigger>
              <SelectValue placeholder="Select model…" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="MCP Server">
          <Select
            value={form.mcp_server_id}
            onValueChange={setSel("mcp_server_id")}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MCP}>None</SelectItem>
              {mcps.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="System Prompt">
          <Textarea
            value={form.system_prompt}
            onChange={set("system_prompt")}
            rows={3}
            placeholder="Optional system instructions…"
          />
        </Field>

        <Field label="Description">
          <Input
            value={form.description}
            onChange={set("description")}
            placeholder="Optional"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !form.name || !form.model_id}
          >
            {saving ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
