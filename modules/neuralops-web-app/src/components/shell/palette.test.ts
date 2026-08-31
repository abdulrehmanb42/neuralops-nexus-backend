import { describe, expect, it } from "vitest";
import { buildEntries, filterEntries } from "./palette";
import type { Project, Topic } from "@/lib/api/workspace";

const projects: Project[] = [
  { id: "p1", name: "Demo", slug: "demo", description: null, channels: [{ id: "c1", name: "general", slug: "g", description: null }] },
];
const topics: Topic[] = [{ id: "t1", title: "Q3 numbers review", slug: "q", channel_id: "c1", project_id: "p1" }];

describe("command palette entries", () => {
  it("builds navigable entries for projects, channels, topics + actions", () => {
    const entries = buildEntries(projects, topics);
    expect(entries.find((e) => e.kind === "channel")?.select).toEqual({ pid: "p1", cid: "c1" });
    expect(entries.find((e) => e.kind === "topic")?.select).toEqual({ pid: "p1", cid: "c1", tid: "t1" });
    expect(entries.filter((e) => e.kind === "action").map((e) => e.action)).toEqual(["theme", "server", "about"]);
  });

  it("filters by label and detail, case-insensitive", () => {
    const entries = buildEntries(projects, topics);
    expect(filterEntries(entries, "q3").map((e) => e.id)).toEqual(["t:t1"]);
    expect(filterEntries(entries, "GENERAL")[0].id).toBe("c:c1");
    expect(filterEntries(entries, "demo").length).toBeGreaterThanOrEqual(2); // project + its channel via detail
  });

  it("returns a capped default list for an empty query", () => {
    expect(filterEntries(buildEntries(projects, topics), "").length).toBeLessThanOrEqual(12);
  });
});
