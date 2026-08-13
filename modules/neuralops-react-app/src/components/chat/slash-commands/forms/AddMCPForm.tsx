import { useState } from "react";
import { toast } from "sonner";
import { createMCPServer } from "@/services/mcp-servers.service";
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

interface FormState {
  name: string;
  description: string;
  url: string;
  command: string;
  transport: string;
  server_type: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  url: "",
  command: "",
  transport: "streamable-http",
  server_type: "remote",
};

// Mirrors the backend's CHECK constraints on MCPServer (mcp_stdio_requires_command
// / mcp_http_sse_ws_requires_url) -- which field is actually required depends on
// transport, not "always url" like the form used to assume.
function isStdio(transport: string) {
  return transport === "stdio";
}

export function AddMCPForm({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function setSel(key: keyof FormState) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const stdio = isStdio(form.transport);
    if (!form.name || (stdio ? !form.command : !form.url)) return;
    if (!projectId) {
      toast.error("Open a project first -- MCP servers belong to a project.");
      return;
    }
    setSaving(true);
    try {
      // Only send the field this transport actually uses -- avoid sending an
      // empty string for the other one, which would fail the backend's
      // CHECK constraint (it wants NULL, not "").
      const payload = stdio
        ? { ...form, url: null }
        : { ...form, command: null };
      await createMCPServer(projectId, payload);
      toast.success(`MCP server "${form.name}" registered`);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to register MCP server",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Register MCP Server" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Name *">
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="NeuralOps ERP"
            autoFocus
          />
        </Field>

        {isStdio(form.transport) ? (
          <Field label="Command *">
            <Input
              value={form.command}
              onChange={set("command")}
              placeholder={`ssh -i ~/.ssh/key user@host "bash -c '...'"`}
              className="font-mono text-xs"
            />
          </Field>
        ) : (
          <Field label="URL *">
            <Input
              value={form.url}
              onChange={set("url")}
              placeholder="http://nexus-erp-mcp:8000/mcp"
            />
          </Field>
        )}

        <Field label="Transport">
          <Select value={form.transport} onValueChange={setSel("transport")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="streamable-http">streamable-http</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
              <SelectItem value="stdio">stdio</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Server Type">
          <Select
            value={form.server_type}
            onValueChange={setSel("server_type")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="local">Local</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={set("description")}
            rows={2}
            placeholder="Optional"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              !form.name ||
              (isStdio(form.transport) ? !form.command : !form.url)
            }
          >
            {saving ? "Saving…" : "Register"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
