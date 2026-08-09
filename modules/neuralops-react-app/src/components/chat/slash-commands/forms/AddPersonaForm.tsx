import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPersona } from "@/services/personas.service";
import { listAIModels } from "@/services/ai-models.service";
import { listAgents } from "@/services/agents.service";
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
import type { AIModel, Agent } from "@/types";

interface FormState {
  name: string;
  description: string;
  source_type: "model" | "agent";
  model_id: string;
  agent_id: string;
  system_prompt: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  source_type: "agent",
  model_id: "",
  agent_id: "",
  system_prompt: "",
};

export function AddPersonaForm({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
}) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listAIModels().then(setModels).catch(() => {});
    listAgents().then(setAgents).catch(() => {});
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
    const hasTarget =
      form.source_type === "agent" ? !!form.agent_id : !!form.model_id;
    if (!projectId) {
      toast.error("Open a project first -- personas belong to a project.");
      return;
    }
    if (!form.name || !hasTarget) {
      toast.error(
        !form.name ? "Name is required" : `Select a ${form.source_type}`,
      );
      return;
    }
    setSaving(true);
    try {
      await createPersona(projectId, {
        name: form.name,
        description: form.description || undefined,
        source_type: form.source_type,
        model_id: form.source_type === "model" ? form.model_id : undefined,
        agent_id: form.source_type === "agent" ? form.agent_id : undefined,
        prompt: {
          system_prompt: form.system_prompt || `You are ${form.name}, a helpful AI assistant.`,
          output_type: "text",
        },
      } as never);
      toast.success(`Persona @${form.name} created`);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create persona",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Create Persona" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Name * (used as @mention)">
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="Layla"
            autoFocus
          />
        </Field>

        <Field label="Backed by">
          <Select
            value={form.source_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                source_type: v as "model" | "agent",
                model_id: "",
                agent_id: "",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="model">Model directly</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {form.source_type === "agent" ? (
          <Field label="Agent *">
            <Select value={form.agent_id} onValueChange={setSel("agent_id")}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent…" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Model *">
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
        )}

        <Field label="System Prompt">
          <Textarea
            value={form.system_prompt}
            onChange={set("system_prompt")}
            rows={2}
            placeholder={`You are ${form.name || "a helpful AI assistant"}.`}
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
          <Button type="submit" disabled={saving || !form.name}>
            {saving ? "Creating…" : "Create Persona"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
