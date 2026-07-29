import { useState } from "react";
import { toast } from "sonner";
import { createAIModel } from "@/services/ai-models.service";
import { FormDialog, Field } from "./shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface FormState {
  name: string;
  model_id: string;
  provider: string;
  api_base: string;
  api_key: string;
  description: string;
  licence_accepted: boolean;
}

const EMPTY: FormState = {
  name: "",
  model_id: "",
  provider: "litellm",
  api_base: "",
  api_key: "",
  description: "",
  licence_accepted: false,
};

export function AddModelForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.model_id) return;
    setSaving(true);
    try {
      await createAIModel({ ...form });
      toast.success(`Model "${form.name}" added`);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Add AI Model" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Name *">
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="GPT-4o"
            autoFocus
          />
        </Field>

        <Field label="Model ID * (LiteLLM format)">
          <Input
            value={form.model_id}
            onChange={set("model_id")}
            placeholder="gpt-4o"
          />
        </Field>

        <Field label="API Base URL">
          <Input
            value={form.api_base}
            onChange={set("api_base")}
            placeholder="https://api.openai.com/v1"
          />
        </Field>

        <Field label="API Key">
          <Input
            type="password"
            value={form.api_key}
            onChange={set("api_key")}
            placeholder="sk-..."
          />
        </Field>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={set("description")}
            rows={2}
            placeholder="Optional"
          />
        </Field>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="licence"
            checked={form.licence_accepted}
            onChange={(e) => setForm((f) => ({ ...f, licence_accepted: e.target.checked }))}
          />
          <label htmlFor="licence" className="text-xs text-muted-foreground">
            I accept the provider's terms of service
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !form.name || !form.model_id || !form.licence_accepted}
          >
            {saving ? "Adding…" : "Add Model"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
