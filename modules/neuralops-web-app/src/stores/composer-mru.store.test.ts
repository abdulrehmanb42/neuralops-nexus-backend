import { beforeEach, describe, expect, it } from "vitest";
import {
  bumpRecent,
  orderByRecency,
  useComposerMruStore,
  MRU_CAP,
} from "./composer-mru.store";

describe("bumpRecent", () => {
  it("adds a new name to the front", () => {
    expect(bumpRecent(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });
  it("moves an existing name to the front (dedupe, case-insensitive)", () => {
    expect(bumpRecent(["a", "b", "c"], "C")).toEqual(["C", "a", "b"]);
  });
  it("preserves the relative order of the others", () => {
    expect(bumpRecent(["x", "y", "z"], "y")).toEqual(["y", "x", "z"]);
  });
  it("caps the list length, dropping the oldest", () => {
    const full = Array.from({ length: MRU_CAP }, (_, i) => `n${i}`);
    const next = bumpRecent(full, "fresh");
    expect(next).toHaveLength(MRU_CAP);
    expect(next[0]).toBe("fresh");
    expect(next).not.toContain(`n${MRU_CAP - 1}`); // oldest dropped
  });
});

describe("orderByRecency", () => {
  const items = [{ n: "Alpha" }, { n: "Bravo" }, { n: "Charlie" }, { n: "Delta" }];
  const key = (i: { n: string }) => i.n;

  it("floats recents to the front in MRU order, others keep original order", () => {
    const out = orderByRecency(items, key, ["Charlie", "Alpha"]);
    expect(out.map(key)).toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
  });
  it("matches recents case-insensitively", () => {
    const out = orderByRecency(items, key, ["delta"]);
    expect(out.map(key)).toEqual(["Delta", "Alpha", "Bravo", "Charlie"]);
  });
  it("leaves order unchanged when there are no recents", () => {
    expect(orderByRecency(items, key, []).map(key)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });
  it("ignores recents that are not in the list (deleted personas)", () => {
    const out = orderByRecency(items, key, ["Ghost", "Bravo"]);
    expect(out.map(key)).toEqual(["Bravo", "Alpha", "Charlie", "Delta"]);
  });
  it("does not mutate the input array", () => {
    const input = [...items];
    orderByRecency(input, key, ["Delta"]);
    expect(input.map(key)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });
});

describe("useComposerMruStore", () => {
  beforeEach(() => useComposerMruStore.getState().clear());

  it("records personas and commands most-recent-first", () => {
    const s = useComposerMruStore.getState();
    s.recordPersona("Layla");
    s.recordPersona("Dev");
    s.recordCommand("swarm");
    expect(useComposerMruStore.getState().personas).toEqual(["Dev", "Layla"]);
    expect(useComposerMruStore.getState().commands).toEqual(["swarm"]);
  });
  it("dedupes a re-recorded persona to the front", () => {
    const s = useComposerMruStore.getState();
    s.recordPersona("Layla");
    s.recordPersona("Dev");
    s.recordPersona("Layla");
    expect(useComposerMruStore.getState().personas).toEqual(["Layla", "Dev"]);
  });
  it("clear() empties both lists (sign-out privacy)", () => {
    const s = useComposerMruStore.getState();
    s.recordPersona("Layla");
    s.recordCommand("invite");
    s.clear();
    expect(useComposerMruStore.getState().personas).toEqual([]);
    expect(useComposerMruStore.getState().commands).toEqual([]);
  });
});
