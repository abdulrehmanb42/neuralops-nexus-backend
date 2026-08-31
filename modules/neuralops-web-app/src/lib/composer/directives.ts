// Composer intelligence: mention/directive tokens and their constraints.
// Verified against server parsing: mentions are @[\w]+ (no hyphens/dots),
// {session, close} + the 8 output-type words are reserved and unmentionable.

export const OUTPUT_DIRECTIVES = [
  { name: "chart", label: "Chart", hint: "Interactive chart" },
  { name: "table", label: "Table", hint: "Data table" },
  { name: "diagram", label: "Diagram", hint: "Mermaid diagram" },
  { name: "form", label: "Form", hint: "Working form" },
  { name: "code", label: "Code", hint: "Highlighted code" },
  { name: "terminal", label: "Terminal", hint: "Console output" },
  { name: "html", label: "Page", hint: "Full HTML page" },
  { name: "text", label: "Text", hint: "Plain text" },
] as const;

export const SESSION_DIRECTIVES = [
  { name: "session", label: "Start AI session", hint: "Open a session with the personas you mention", insert: "session" },
  { name: "session close", label: "End AI session", hint: "Close the active AI session", insert: "session close" },
] as const;

export const CONTEXT_DIRECTIVE = { name: "file", label: "Attach a file", hint: "Add a document to the AI's context" } as const;

export const RESERVED_MENTIONS = new Set(["session", "close", ...OUTPUT_DIRECTIVES.map((d) => d.name)]);

// Rich types stream raw markers/HTML — the bubble shows a composing
// placeholder until message_done delivers the parsed result.
export const RICH_OUTPUT_TYPES = new Set(["html", "chart", "table", "form", "terminal"]);

export interface MentionTrigger {
  query: string;
  start: number; // index of the "@"
}

// An @-token being typed at the caret (word chars only, matching the server).
export function mentionTriggerAt(text: string, caret: number): MentionTrigger | null {
  const upToCaret = text.slice(0, caret);
  const match = /(^|[^\w@])@([\w]*)$/.exec(upToCaret);
  if (!match) return null;
  return { query: match[2], start: caret - match[2].length - 1 };
}

export function insertMention(text: string, trigger: MentionTrigger, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  const next = text.slice(0, trigger.start) + inserted + text.slice(caret);
  return { text: next, caret: trigger.start + inserted.length };
}

// Toggle a trailing output directive: one directive at a time makes sense —
// the server takes the first match anyway.
export function toggleDirective(text: string, name: string): string {
  const re = new RegExp(`(^|\\s)@(${OUTPUT_DIRECTIVES.map((d) => d.name).join("|")})\\b`, "gi");
  const stripped = text.replace(re, (_, pre) => pre).replace(/[^\S\n]{2,}/g, " ").trimEnd();
  const had = new RegExp(`(^|\\s)@${name}\\b`, "i").test(text);
  if (had) return stripped;
  return stripped.length ? `${stripped} @${name}` : `@${name}`;
}

export function activeDirective(text: string): string | null {
  const m = new RegExp(`(?:^|\\s)@(${OUTPUT_DIRECTIVES.map((d) => d.name).join("|")})\\b`, "i").exec(text);
  return m ? m[1].toLowerCase() : null;
}

// The backend's marker fallback can leak <<<...>>> blocks into final content
// (audited upstream bug). Strip defensively before rendering.
export function stripLeakedMarkers(content: string): string {
  return content
    .replace(/<<<EMBED>>>[\s\S]*?<<<END_EMBED>>>/g, "")
    .replace(/<<<CONTEXT>>>[\s\S]*?<<<END>>>/g, "")
    .replace(/<<<OUTPUT:\w+>>>/g, "")
    .replace(/<<<END_OUTPUT>>>/g, "")
    .replace(/<<<(HTML|TERMINAL|FORM)>>>/g, "")
    .trim();
}

// Is a persona name mentionable? (create-form + popover safety)
export function isMentionableName(name: string): boolean {
  return /^[\w]+$/.test(name) && !RESERVED_MENTIONS.has(name.toLowerCase());
}
