import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Bot, Cpu, Plug, User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAIModels, createAIModel, deleteAIModel } from "@/services/ai-models.service";
import { listMCPServers, createMCPServer, deleteMCPServer } from "@/services/mcp-servers.service";
import { listAgents, createAgent, deleteAgent } from "@/services/agents.service";
import { listPersonas, createPersona, patchPersona, deletePersona } from "@/services/personas.service";
import type { AIModel, MCPServer, Agent, Persona } from "@/types";

export const Route = createFileRoute("/app/agents")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s.tab as string) || "mcps" }),
  component: AgentsPage,
});

// ── Shared helpers ─────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-foreground-muted">
      <Icon className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">No {label} yet</p>
    </div>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 shrink-0 text-foreground-muted hover:text-destructive"
      onClick={onDelete}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
      {children}
    </div>
  );
}

// ── Models Tab ─────────────────────────────────────────────────────────────────

function ModelsTab() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    model_id: "",
    api_key: "",
    temperature: "0.7",
    max_tokens: "4096",
    supports_tools: true,
    licence_accepted: false,
  });

  useEffect(() => {
    listAIModels().then(setModels).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!form.name || !form.model_id) {
      toast.error("Name and Model ID are required.");
      return;
    }
    if (!form.licence_accepted) {
      toast.error("You must accept the provider's terms of service.");
      return;
    }
    setSaving(true);
    try {
      const m = await createAIModel({
        name: form.name,
        model_id: form.model_id,
        api_key: form.api_key || undefined,
        provider: "litellm",
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens),
        supports_tools: form.supports_tools,
        supports_streaming: true,
        licence_accepted: form.licence_accepted,
      });
      setModels((prev) => [...prev, m]);
      setOpen(false);
      setForm({ name: "", model_id: "", api_key: "", temperature: "0.7", max_tokens: "4096", supports_tools: true, licence_accepted: false });
      toast.success(`Model "${m.name}" added.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create model.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteAIModel(id);
      setModels((prev) => prev.filter((m) => m.id !== id));
      toast.success(`Model "${name}" removed.`);
    } catch {
      toast.error("Failed to delete model.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Model
        </Button>
      </div>

      {models.length === 0 ? (
        <EmptyState icon={Cpu} label="AI models" />
      ) : (
        <div className="space-y-2">
          {models.map((m) => (
            <Row key={m.id}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
                <p className="text-xs text-foreground-muted truncate">{m.model_id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.has_api_key && (
                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-600">key set</span>
                )}
                <span className="text-xs text-foreground-muted">{m.provider}</span>
                <DeleteButton onDelete={() => handleDelete(m.id, m.name)} />
              </div>
            </Row>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add AI Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Display Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="GPT-4o" className="mt-1" />
            </div>
            <div>
              <Label>Model ID <span className="text-foreground-muted">(LiteLLM format)</span></Label>
              <Input value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} placeholder="openai/gpt-4o" className="mt-1" />
              <p className="mt-1 text-xs text-foreground-muted">
                Examples: openai/gpt-4o · anthropic/claude-sonnet-4-6 · openai/o3-mini
              </p>
            </div>
            <div>
              <Label>API Key <span className="text-foreground-muted">(optional — uses env var if blank)</span></Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="sk-..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Temperature</Label>
                <Input value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Max Tokens</Label>
                <Input value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.supports_tools} onCheckedChange={(v) => setForm({ ...form, supports_tools: v })} />
              <Label>Supports tool use (MCP)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.licence_accepted} onCheckedChange={(v) => setForm({ ...form, licence_accepted: v })} />
              <Label>I accept the provider's terms of service</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Add Model"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── MCP Servers Tab ────────────────────────────────────────────────────────────

function MCPServersTab() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    transport: "http",
    url: "",
    is_first_party: true,
    embed_output: true,
  });

  useEffect(() => {
    listMCPServers().then(setServers).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!form.name || !form.url) {
      toast.error("Name and URL are required.");
      return;
    }
    setSaving(true);
    try {
      const s = await createMCPServer({
        name: form.name,
        description: form.description || undefined,
        server_type: "remote",
        transport: form.transport,
        url: form.url,
        is_first_party: form.is_first_party,
        embed_output: form.embed_output,
        config: {},
        timeout_seconds: 60,
        max_retries: 3,
      });
      setServers((prev) => [...prev, s]);
      setOpen(false);
      setForm({ name: "", description: "", transport: "http", url: "", is_first_party: true, embed_output: true });
      toast.success(`MCP server "${s.name}" added.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create MCP server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteMCPServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      toast.success(`MCP server "${name}" removed.`);
    } catch {
      toast.error("Failed to delete MCP server.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add MCP Server
        </Button>
      </div>

      {servers.length === 0 ? (
        <EmptyState icon={Plug} label="MCP servers" />
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <Row key={s.id}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-foreground-muted truncate">{s.url}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px]">{s.transport}</span>
                {s.is_first_party && (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600">first-party</span>
                )}
                <DeleteButton onDelete={() => handleDelete(s.id, s.name)} />
              </div>
            </Row>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="NeuralOps ERP" className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-foreground-muted">(optional)</span></Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Odoo ERP tools" className="mt-1" />
            </div>
            <div>
              <Label>Transport</Label>
              <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP (Streamable)</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="stdio">STDIO</SelectItem>
                  <SelectItem value="websocket">WebSocket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://nexus-erp-mcp:8000/mcp" className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_first_party} onCheckedChange={(v) => setForm({ ...form, is_first_party: v })} />
              <Label>First-party (we own this server)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.embed_output} onCheckedChange={(v) => setForm({ ...form, embed_output: v })} />
              <Label>Embed tool results to vector DB</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Add Server"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Agents Tab ─────────────────────────────────────────────────────────────────

function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [mcps, setMcps] = useState<MCPServer[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    model_id: "",
    mcp_server_id: "",
    system_prompt: "",
  });

  useEffect(() => {
    Promise.all([listAgents(), listAIModels(), listMCPServers()])
      .then(([a, m, s]) => { setAgents(a); setModels(m); setMcps(s); })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!form.name || !form.model_id) {
      toast.error("Name and Model are required.");
      return;
    }
    setSaving(true);
    try {
      const a = await createAgent({
        name: form.name,
        description: form.description || undefined,
        model_id: form.model_id,
        mcp_server_id: form.mcp_server_id || undefined,
        system_prompt: form.system_prompt || undefined,
        agent_type: "internal",
      } as Partial<Agent>);
      setAgents((prev) => [...prev, a]);
      setOpen(false);
      setForm({ name: "", description: "", model_id: "", mcp_server_id: "", system_prompt: "" });
      toast.success(`Agent "${a.name}" created.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create agent.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast.success(`Agent "${name}" removed.`);
    } catch {
      toast.error("Failed to delete agent.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState icon={Bot} label="agents" />
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <Row key={a.id}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.name}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {a.model_name ?? "—"}{a.mcp_server_name ? ` · ${a.mcp_server_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px]">{a.agent_type}</span>
                <DeleteButton onDelete={() => handleDelete(a.id, a.name)} />
              </div>
            </Row>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Agent Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ERP Agent" className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-foreground-muted">(optional)</span></Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Handles Odoo ERP queries" className="mt-1" />
            </div>
            <div>
              <Label>AI Model</Label>
              <Select value={form.model_id} onValueChange={(v) => setForm({ ...form, model_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a model..." /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>MCP Server <span className="text-foreground-muted">(optional)</span></Label>
              <Select value={form.mcp_server_id} onValueChange={(v) => setForm({ ...form, mcp_server_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="None (model only)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {mcps.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>System Prompt <span className="text-foreground-muted">(optional)</span></Label>
              <Textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="You are an ERP assistant with access to Odoo..."
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Create Agent"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Personas Tab ───────────────────────────────────────────────────────────────

function PersonasTab() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    source_type: "agent" as "agent" | "model",
    model_id: "",
    agent_id: "",
    system_prompt: "",
    output_type: "text",
  });

  // Edit state
  const [editTarget, setEditTarget] = useState<Persona | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", system_prompt: "", output_type: "text" });
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(p: Persona) {
    setEditTarget(p);
    setEditForm({
      name: p.name,
      description: p.description ?? "",
      system_prompt: p.prompt?.system_prompt ?? "",
      output_type: p.prompt?.output_type ?? "text",
    });
  }

  async function handleEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const updated = await patchPersona(editTarget.id, {
        name: editForm.name || undefined,
        description: editForm.description || undefined,
        prompt: { system_prompt: editForm.system_prompt, output_type: editForm.output_type } as Persona["prompt"],
      });
      setPersonas((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      setEditTarget(null);
      toast.success(`Persona "@${updated.name}" updated.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update persona.");
    } finally {
      setEditSaving(false);
    }
  }

  useEffect(() => {
    Promise.all([listPersonas(), listAIModels(), listAgents()])
      .then(([p, m, a]) => { setPersonas(p); setModels(m); setAgents(a); })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!form.name) { toast.error("Name is required."); return; }
    if (form.source_type === "model" && !form.model_id) { toast.error("Select a model."); return; }
    if (form.source_type === "agent" && !form.agent_id) { toast.error("Select an agent."); return; }
    setSaving(true);
    try {
      const p = await createPersona({
        name: form.name,
        description: form.description || undefined,
        source_type: form.source_type,
        model_id: form.source_type === "model" ? form.model_id : undefined,
        agent_id: form.source_type === "agent" ? form.agent_id : undefined,
        prompt: {
          system_prompt: form.system_prompt || `You are ${form.name}, a helpful AI assistant.`,
          output_type: form.output_type,
        } as Persona["prompt"],
      });
      setPersonas((prev) => [...prev, p]);
      setOpen(false);
      setForm({ name: "", description: "", source_type: "agent", model_id: "", agent_id: "", system_prompt: "", output_type: "text" });
      toast.success(`Persona "@${p.name}" created.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create persona.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deletePersona(id);
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      toast.success(`Persona "@${name}" removed.`);
    } catch {
      toast.error("Failed to delete persona.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Persona
        </Button>
      </div>

      {personas.length === 0 ? (
        <EmptyState icon={User} label="personas" />
      ) : (
        <div className="space-y-2">
          {personas.map((p) => (
            <Row key={p.id}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">@{p.name}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {p.source_type === "model" ? "Model persona" : "Agent persona"}
                  {p.prompt?.output_type && p.prompt.output_type !== "text" ? ` · ${p.prompt.output_type}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px]">{p.source_type}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-foreground-muted hover:text-foreground"
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <DeleteButton onDelete={() => handleDelete(p.id, p.name)} />
              </div>
            </Row>
          ))}
        </div>
      )}

      {/* ── Edit Persona Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit @{editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Description <span className="text-foreground-muted">(optional)</span></Label>
              <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Default Output Type</Label>
              <Select value={editForm.output_type} onValueChange={(v) => setEditForm({ ...editForm, output_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="terminal">Terminal</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>System Prompt</Label>
              <Textarea
                value={editForm.system_prompt}
                onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
                className="mt-1 min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Persona Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Persona</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Persona Name <span className="text-foreground-muted">(used as @mention)</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ERP" className="mt-1" />
              <p className="mt-1 text-xs text-foreground-muted">Users will mention this as @{form.name || "Name"} in chat.</p>
            </div>
            <div>
              <Label>Description <span className="text-foreground-muted">(optional)</span></Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ERP assistant with Odoo access" className="mt-1" />
            </div>
            <div>
              <Label>Backed by</Label>
              <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v as "agent" | "model", model_id: "", agent_id: "" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent (model + MCP tools)</SelectItem>
                  <SelectItem value="model">Model only (no tools)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.source_type === "model" ? (
              <div>
                <Label>AI Model</Label>
                <Select value={form.model_id} onValueChange={(v) => setForm({ ...form, model_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select a model..." /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Agent</Label>
                <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select an agent..." /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}{a.mcp_server_name ? ` (${a.mcp_server_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Default Output Type</Label>
              <Select value={form.output_type} onValueChange={(v) => setForm({ ...form, output_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="terminal">Terminal</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>System Prompt <span className="text-foreground-muted">(optional)</span></Label>
              <Textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder={`You are ${form.name || "a helpful AI assistant"} with access to...`}
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Create Persona"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function AgentsPage() {
  const { tab } = useSearch({ from: "/app/agents" });
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-lg font-semibold text-foreground">AI Intelligence</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Manage models, MCP servers, agents, and personas. All resources are company-wide and shared across all projects.
        </p>

        <Tabs value={tab} className="mt-6">
          <TabsList className="mb-4">
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="mcps">MCP Servers</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="personas">Personas</TabsTrigger>
          </TabsList>

          <TabsContent value="models"><ModelsTab /></TabsContent>
          <TabsContent value="mcps"><MCPServersTab /></TabsContent>
          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="personas"><PersonasTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
