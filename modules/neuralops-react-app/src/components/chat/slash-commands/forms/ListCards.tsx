import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listAIModels, deleteAIModel } from "@/services/ai-models.service";
import { listAgents, deleteAgent } from "@/services/agents.service";
import { listPersonas, deletePersona } from "@/services/personas.service";
import { listMCPServers, deleteMCPServer } from "@/services/mcp-servers.service";
import { listSchedules, updateSchedule, deleteSchedule } from "@/services/schedules.service";
import { FormDialog } from "./shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AIModel, Agent, Persona, MCPServer, PersonaSchedule } from "@/types";

// ── Generic delete button ─────────────────────────────────────────────────────

function DeleteBtn({ onDelete }: { onDelete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      toast.error("Delete failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={handle}
      disabled={busy}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

// ── Models ────────────────────────────────────────────────────────────────────

export function ListModelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAIModels().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  async function remove(id: string, name: string) {
    await deleteAIModel(id);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success(`Model "${name}" removed`);
  }

  return (
    <FormDialog title="AI Models" open={open} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No models yet. Use <code>/add-model</code>.</p>
        )}
        {items.map((m) => (
          <div key={m.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{m.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary">{m.provider}</Badge>
                <DeleteBtn onDelete={() => remove(m.id, m.name)} />
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground font-mono">{m.model_id}</div>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}

// ── MCP Servers ───────────────────────────────────────────────────────────────

export function ListMCPsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listMCPServers().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  async function remove(id: string, name: string) {
    await deleteMCPServer(id);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success(`MCP server "${name}" removed`);
  }

  return (
    <FormDialog title="MCP Servers" open={open} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No MCP servers yet. Use <code>/add-mcp</code>.</p>
        )}
        {items.map((m) => (
          <div key={m.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{m.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary">{m.transport}</Badge>
                <DeleteBtn onDelete={() => remove(m.id, m.name)} />
              </div>
            </div>
            {m.url && <div className="mt-1 text-xs text-muted-foreground font-mono truncate">{m.url}</div>}
          </div>
        ))}
      </div>
    </FormDialog>
  );
}

// ── Agents ────────────────────────────────────────────────────────────────────

export function ListAgentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAgents().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  async function remove(id: string, name: string) {
    await deleteAgent(id);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success(`Agent "${name}" removed`);
  }

  return (
    <FormDialog title="Agents" open={open} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No agents yet. Use <code>/add-agent</code>.</p>
        )}
        {items.map((a) => (
          <div key={a.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{a.name}</span>
              <DeleteBtn onDelete={() => remove(a.id, a.name)} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {a.model_name ?? "—"}{a.mcp_server_name ? ` · ${a.mcp_server_name}` : ""}
            </div>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}

// ── Personas ──────────────────────────────────────────────────────────────────

export function ListPersonasDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string | null }) {
  const [items, setItems] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listPersonas(projectId).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [open, projectId]);

  async function remove(id: string, name: string) {
    await deletePersona(id);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success(`Persona @${name} removed`);
  }

  return (
    <FormDialog title="Personas" open={open} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No personas yet. Use <code>/add-persona</code>.</p>
        )}
        {items.map((p) => (
          <div key={p.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">@{p.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary">{p.source_type}</Badge>
                {p.prompt?.output_type && p.prompt.output_type !== "text" && (
                  <Badge variant="outline">{p.prompt.output_type}</Badge>
                )}
                <DeleteBtn onDelete={() => remove(p.id, p.name)} />
              </div>
            </div>
            {p.description && (
              <div className="mt-1 text-xs text-muted-foreground">{p.description}</div>
            )}
            {p.prompt?.system_prompt && (
              <div className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground font-mono whitespace-pre-wrap line-clamp-4">
                {p.prompt.system_prompt}
              </div>
            )}
          </div>
        ))}
      </div>
    </FormDialog>
  );
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export function ListSchedulesDialog({
  open,
  onClose,
  projectId,
  channelId,
  topicId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  channelId?: string | null;
  topicId?: string | null;
}) {
  const [items, setItems] = useState<PersonaSchedule[]>([]);
  const [loading, setLoading] = useState(false);

  function reload() {
    if (!projectId || !channelId || !topicId) return;
    setLoading(true);
    listSchedules(projectId, channelId, topicId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, channelId, topicId]);

  async function togglePause(s: PersonaSchedule) {
    if (!projectId || !channelId || !topicId) return;
    try {
      const updated = await updateSchedule(projectId, channelId, topicId, s.id, { is_paused: !s.is_paused });
      setItems((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (e) {
      toast.error("Failed to update schedule: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function remove(id: string, label: string) {
    if (!projectId || !channelId || !topicId) return;
    await deleteSchedule(projectId, channelId, topicId, id);
    setItems((prev) => prev.filter((x) => x.id !== id));
    toast.success(`Schedule "${label}" removed`);
  }

  const statusVariant = (s: PersonaSchedule) =>
    s.last_status === "failed" ? "destructive" : s.last_status === "success" ? "secondary" : "outline";

  return (
    <FormDialog title="Schedules" open={open} onClose={onClose}>
      <div className="mt-2 flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No schedules yet in this topic. Use <code>/schedule</code>.</p>
        )}
        {items.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">
                @{s.persona_name}{s.label ? ` — ${s.label}` : ""}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={!s.is_paused} onCheckedChange={() => togglePause(s)} />
                <DeleteBtn onDelete={() => remove(s.id, s.label || s.persona_name)} />
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.schedule_summary}</div>
            <div className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{s.query_text}</div>
            <div className="mt-2 flex items-center gap-1.5">
              <Badge variant={s.is_paused ? "outline" : "secondary"}>{s.is_paused ? "Paused" : "Active"}</Badge>
              {s.last_status !== "never_run" && (
                <Badge variant={statusVariant(s)}>
                  {s.last_status === "success" ? "Last run OK" : "Last run failed"}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
