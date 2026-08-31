import type { Project, Topic } from "@/lib/api/workspace";

export interface PaletteEntry {
  id: string;
  kind: "project" | "channel" | "topic" | "action";
  label: string;
  detail?: string;
  // Navigation is store-driven — ids stay out of the URL (privacy rule).
  select?: { pid: string; cid: string; tid?: string };
  action?: string;
}

export function buildEntries(projects: Project[], topics: Topic[]): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const p of projects) {
    // Picking a project lands in its first channel — a project with no
    // channels stays listed but has nowhere to go yet.
    const first = p.channels[0];
    out.push({
      id: `p:${p.id}`,
      kind: "project",
      label: p.name,
      detail: first ? undefined : "no channels yet",
      select: first ? { pid: p.id, cid: first.id } : undefined,
    });
    for (const c of p.channels) {
      out.push({ id: `c:${c.id}`, kind: "channel", label: `# ${c.name}`, detail: p.name, select: { pid: p.id, cid: c.id } });
    }
  }
  for (const t of topics) {
    out.push({ id: `t:${t.id}`, kind: "topic", label: t.title, detail: "chat", select: { pid: t.project_id, cid: t.channel_id, tid: t.id } });
  }
  out.push(
    { id: "a:theme", kind: "action", label: "Toggle theme", action: "theme" },
    { id: "a:server", kind: "action", label: "Switch server", action: "server" },
    { id: "a:about", kind: "action", label: "About NeuralOps Nexus", action: "about" },
  );
  return out;
}

export function filterEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, 12);
  return entries
    .filter((e) => e.label.toLowerCase().includes(q) || e.detail?.toLowerCase().includes(q))
    .slice(0, 12);
}
