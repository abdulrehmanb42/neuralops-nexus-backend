import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPersonas, patchPersona } from "@/services/personas.service";
import { FormDialog, Field } from "./shared";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Persona, Prompt } from "@/types";

export function EditPersonaForm({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
}) {
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    listPersonas(projectId)
      .then(setAllPersonas)
      .catch(() => {});
  }, [open, projectId]);

  // When selected persona changes, populate the form
  useEffect(() => {
    if (!selectedPersonaId) {
      setSystemPrompt("");
      return;
    }
    const p = allPersonas.find((x) => x.id === selectedPersonaId);
    if (p) {
      setSystemPrompt(p.prompt?.system_prompt || "");
    }
  }, [selectedPersonaId, allPersonas]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPersonaId) {
      toast.error("Please select a persona to edit.");
      return;
    }
    setSaving(true);
    try {
      await patchPersona(selectedPersonaId, {
        // PATCH payload — the server owns the prompt id, so it isn't sent.
        prompt: {
          system_prompt: systemPrompt,
          output_type: "text",
        } as Prompt,
      });
      toast.success(`Persona updated successfully!`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update persona");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Edit Persona" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Select Persona">
          <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a persona to edit..." />
            </SelectTrigger>
            <SelectContent>
              {allPersonas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  @{p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {selectedPersonaId && (
          <>
            <Field label="System Prompt">
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="You are a helpful assistant."
              />
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !selectedPersonaId}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
