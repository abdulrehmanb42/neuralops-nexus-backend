import type { UiMessage } from "@/lib/realtime/message-store";

// Session state is not exposed by any endpoint — the ONLY signals are the
// server's verbatim system messages. The open message embeds the timeout
// ("opened (30 min)"), which is what makes a countdown possible at all.
// Caveat (server model): sessions are per (user, topic) but the messages
// carry no user attribution — the banner therefore describes the session,
// not ownership.

const OPEN_RE = /^Session with (@[\w]+(?:, @[\w]+)*) opened \((\d+) min\)\./;
// Matches the bare legacy "Session closed." AND the detailed
// "Session with @X[, @Y] closed." Deliberately name-char-agnostic (`.+`, not
// `@\w+`): persona names are unconstrained (hyphens/spaces/dots all occur), and
// a close that fails to match would latch the banner OPEN on a dead session —
// the fail-unsafe direction. The `$`-anchored ` closed.` suffix keeps it from
// matching the open message ("…automatically.") or any other system message
// (none other both start with "Session " and end in " closed.").
const CLOSE_RE = /^Session (?:with .+ )?closed\.$/;

export interface SessionState {
  personas: string[]; // names without the @
  openedAt: string;
  minutes: number;
}

export function parseSessionState(messages: UiMessage[]): SessionState | null {
  let current: SessionState | null = null;
  for (const m of messages) {
    if (!m.isSystem) continue;
    const open = OPEN_RE.exec(m.content);
    if (open && m.createdAt) {
      current = {
        personas: open[1].split(", ").map((n) => n.slice(1)),
        openedAt: m.createdAt,
        minutes: Number(open[2]),
      };
      continue;
    }
    if (CLOSE_RE.test(m.content)) current = null;
  }
  return current;
}

export function sessionRemainingMs(state: SessionState, now: number): number {
  return new Date(state.openedAt).getTime() + state.minutes * 60_000 - now;
}
