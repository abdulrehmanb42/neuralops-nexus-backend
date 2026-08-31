import { describe, expect, it } from "vitest";
import { parseSessionState, sessionRemainingMs } from "./session-state";
import { mentionCount, resolveSubmit, slashTriggerQuery } from "@/lib/composer/slash";
import { RESERVED_MENTIONS } from "@/lib/composer/directives";
import type { UiMessage } from "@/lib/realtime/message-store";

const sys = (content: string, createdAt = "2026-08-29T10:00:00Z"): UiMessage => ({
  id: Math.random().toString(36).slice(2), content, renderAs: "text", outputType: "text",
  senderName: null, senderId: null, senderAvatar: null, senderType: "system", personaId: null,
  sequence: 1, createdAt, isSystem: true, isStreaming: false, isError: false, isStalled: false, lastActivity: 0,
});

describe("parseSessionState", () => {
  it("parses the verbatim open message incl. multi-persona and timeout", () => {
    const state = parseSessionState([sys("Session with @Layla, @Dev opened (30 min). Plain messages will go to them automatically.")]);
    expect(state).toMatchObject({ personas: ["Layla", "Dev"], minutes: 30 });
  });
  it("close message ends the session; later open reopens", () => {
    const msgs = [
      sys("Session with @Layla opened (30 min). Plain messages will go to them automatically."),
      sys("Session closed."),
    ];
    expect(parseSessionState(msgs)).toBeNull();
    msgs.push(sys("Session with @Dev opened (15 min). Plain messages will go to them automatically.", "2026-08-29T11:00:00Z"));
    expect(parseSessionState(msgs)).toMatchObject({ personas: ["Dev"], minutes: 15 });
  });
  it("detailed close message ends the session (with persona names)", () => {
    const msgs = [
      sys("Session with @Layla, @Dev opened (30 min). Plain messages will go to them automatically."),
      sys("Session with @Layla, @Dev closed."),
    ];
    expect(parseSessionState(msgs)).toBeNull();
  });
  it("a special-char close (persona renamed mid-session) still ends the session — no latch", () => {
    // The REACHABLE case: a persona opens a session as @Data (OPEN_RE-parseable,
    // so `current` is actually set), is renamed mid-session (patch_persona has no
    // charset validation), then closed under the new name. CLOSE_RE must clear the
    // banner despite the space/hyphen/dot — else it latches open on a dead session
    // (fail-unsafe). Opening with a parseable name is what makes this exercise
    // CLOSE_RE at all — closing under an unparseable OPEN name would pass vacuously.
    for (const closedName of ["@Data Analyst", "@GITHUB-TAUQEER", "@gpt.helper", "@Q3-Bot, @Data Analyst"]) {
      const opened = parseSessionState([sys("Session with @Data opened (30 min). Plain messages will go to them automatically.")]);
      expect(opened).not.toBeNull(); // guard: the open really registered
      const closed = parseSessionState([
        sys("Session with @Data opened (30 min). Plain messages will go to them automatically."),
        sys(`Session with ${closedName} closed.`),
      ]);
      expect(closed).toBeNull(); // CLOSE_RE matched the special-char close → banner cleared
    }
  });
  it("does not treat the open message (ends '…automatically.') as a close", () => {
    // Guards the permissive close regex against swallowing the open banner.
    const state = parseSessionState([
      sys("Session with @Layla opened (30 min). Plain messages will go to them automatically."),
    ]);
    expect(state).toMatchObject({ personas: ["Layla"], minutes: 30 });
  });
  it("ignores unrelated system messages", () => {
    expect(parseSessionState([sys("Waqas added report.pdf to context")])).toBeNull();
  });
  it("computes remaining time from the embedded timeout", () => {
    const state = parseSessionState([sys("Session with @Layla opened (30 min). Plain messages will go to them automatically.")])!;
    const openedMs = new Date(state.openedAt).getTime();
    expect(sessionRemainingMs(state, openedMs + 10 * 60_000)).toBe(20 * 60_000);
  });
});

describe("slash command resolution", () => {
  it("triggers the popover only on a lone /token", () => {
    expect(slashTriggerQuery("/")).toBe("");
    expect(slashTriggerQuery("/sw")).toBe("sw");
    expect(slashTriggerQuery("/swarm do it")).toBeNull();
    expect(slashTriggerQuery("hello /swarm")).toBeNull();
  });
  it("lets /swarm ride in the message, validates /changeusername, blocks unknown singles", () => {
    expect(resolveSubmit("@A @B build it /swarm")).toEqual({ kind: "send" });
    expect(resolveSubmit("/swarm")).toMatchObject({ kind: "invalid" });
    expect(resolveSubmit("/changeusername Waqas_1")).toEqual({ kind: "changeusername", newName: "Waqas_1" });
    expect(resolveSubmit("/changeusername bad name!")).toMatchObject({ kind: "invalid" });
    expect(resolveSubmit("/unknowncmd")).toMatchObject({ kind: "invalid" });
    expect(resolveSubmit("/notes from standup")).toEqual({ kind: "send" });
    expect(resolveSubmit("plain message")).toEqual({ kind: "send" });
  });
  it("counts distinct persona mentions, excluding reserved words", () => {
    expect(mentionCount("@Layla @Dev @layla @chart do it", RESERVED_MENTIONS)).toBe(2);
    expect(mentionCount("no mentions", RESERVED_MENTIONS)).toBe(0);
  });
});
