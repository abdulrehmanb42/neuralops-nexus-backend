import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzy";
import { orderByRecency } from "@/stores/composer-mru.store";

describe("fuzzyScore", () => {
  it("scores an empty query as 0 (matches everything)", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
  it("ranks prefix best (0), then substring, then subsequence", () => {
    const prefix = fuzzyScore("add", "add-agent")!;
    const substr = fuzzyScore("agent", "add-agent")!;
    const subseq = fuzzyScore("aget", "add-agent")!;
    expect(prefix).toBe(0);
    expect(prefix).toBeLessThan(substr);
    expect(substr).toBeLessThan(subseq);
  });
  it("matches a subsequence — the /aget → add-agent case", () => {
    expect(fuzzyScore("aget", "add-agent")).not.toBeNull();
  });
  it("is case-insensitive", () => {
    expect(fuzzyScore("AGET", "add-agent")).not.toBeNull();
  });
  it("returns null when the chars are not all present in order", () => {
    expect(fuzzyScore("xyz", "add-agent")).toBeNull();
    expect(fuzzyScore("tega", "add-agent")).toBeNull(); // right chars, wrong order
  });
});

describe("fuzzyFilter", () => {
  const cmds = [{ n: "add-agent" }, { n: "add-model" }, { n: "list-agents" }];
  it("keeps only subsequence matches (aget → add-agent, list-agents)", () => {
    expect(fuzzyFilter("aget", cmds, (c) => c.n).map((c) => c.n)).toEqual(["add-agent", "list-agents"]);
  });
  it("orders prefix matches ahead of looser ones", () => {
    const out = fuzzyFilter("add", cmds, (c) => c.n).map((c) => c.n);
    expect(out.slice(0, 2)).toEqual(["add-agent", "add-model"]); // both prefix; list-agents excluded
    expect(out).not.toContain("list-agents");
  });
});

// Locks the composer rule: recency reorders ONLY the empty-query list, so a
// recent-but-worse fuzzy match can never outrank (or, past the cap, hide) a
// better/exact match once the user types a query. Guards the fixed bug.
describe("popover ordering — recency must not override fuzzy score", () => {
  const people = [{ n: "Ae" }, { n: "Alice" }];
  const recents = ["Alice"]; // Alice is recent
  const order = (q: string) => {
    const filtered = fuzzyFilter(q, people, (p) => p.n);
    return (q ? filtered : orderByRecency(filtered, (p) => p.n, recents)).map((p) => p.n);
  };
  it("a typed query keeps the best fuzzy match first even if a worse one is recent", () => {
    // "ae": Ae=prefix(0), Alice=subsequence(10). Ae must lead despite Alice recent.
    expect(order("ae")[0]).toBe("Ae");
  });
  it("an empty query lets recency lead (scores all tie at 0)", () => {
    expect(order("")[0]).toBe("Alice");
  });
});
