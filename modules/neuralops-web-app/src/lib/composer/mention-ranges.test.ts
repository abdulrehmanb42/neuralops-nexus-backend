import { describe, expect, it } from "vitest";
import { findPillRanges } from "./mention-ranges";

const KNOWN = {
  mentions: new Set(["layla", "dev", "bob", "chart", "session", "file"]),
  self: new Set(["waqas"]), // the signed-in user
  humans: new Set(["sara", "omar"]),
  commands: new Set(["swarm", "invite", "add-agent"]),
};
const find = (t: string) => findPillRanges(t, KNOWN);
const spans = (t: string) => find(t).map((r) => t.slice(r.start, r.end));

describe("findPillRanges", () => {
  it("pills a known @mention", () => {
    expect(find("@Layla")).toEqual([{ start: 0, end: 6, kind: "mention" }]);
  });
  it("pills known @mentions and /commands, sorted, tagged by kind", () => {
    expect(find("@Layla do it /swarm")).toEqual([
      { start: 0, end: 6, kind: "mention" },
      { start: 13, end: 19, kind: "command" },
    ]);
  });
  it("pills @directives too (chart/session/file are known)", () => {
    expect(spans("make it @chart from @Layla")).toEqual(["@chart", "@Layla"]);
  });
  it("tags each @name with its kind — persona vs you vs teammate", () => {
    const kinds = find("@Layla @Waqas @Sara").map((r) => r.kind);
    expect(kinds).toEqual(["mention", "self", "human"]); // Layla=persona, Waqas=you, Sara=teammate
  });
  it("pills a hyphenated /command", () => {
    expect(spans("/add-agent now")).toEqual(["/add-agent"]);
  });
  it("does NOT pill an UNKNOWN @mention or /command (typos stay plain)", () => {
    expect(find("@asdf and /qwerty")).toEqual([]);
  });
  it("pills the known token but not the unknown one beside it", () => {
    expect(spans("@Layla and @nobody")).toEqual(["@Layla"]);
  });
  it("does NOT pill an email address", () => {
    expect(find("mail me at user@example.com")).toEqual([]);
  });
  it("does NOT pill slashes inside a URL or path", () => {
    expect(find("see https://x.com/a/b")).toEqual([]);
  });
  it("does NOT pill a bare @ or / with no word", () => {
    expect(find("@ / done")).toEqual([]);
  });
  it("pills a known mention right after an opening paren", () => {
    expect(spans("(@Layla)")).toEqual(["@Layla"]);
  });
});
