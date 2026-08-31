import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { useConnectionStore } from "@/stores/connection.store";
import { createProject, createTopic, listProjects, listTopics, markTopicRead, nextTopicTitle } from "./workspace";

const BASE = "http://server.test:8096";

beforeEach(() => {
  useConnectionStore.setState({ serverUrl: BASE, token: "jwt" });
});

describe("workspace api", () => {
  it("lists projects with nested channels", async () => {
    server.use(
      http.get(`${BASE}/api/v1/projects/`, () =>
        HttpResponse.json([{ id: "p1", name: "Demo", slug: "demo", description: null, channels: [{ id: "c1", name: "general", slug: "general", description: null }] }]),
      ),
    );
    const projects = await listProjects();
    expect(projects[0].channels[0].name).toBe("general");
  });

  it("creates a project", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/api/v1/projects/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "p2", name: "New", slug: "new", description: "d", channels: [] });
      }),
    );
    const p = await createProject("New", "d");
    expect(p.id).toBe("p2");
    expect(body).toEqual({ name: "New", description: "d" });
  });

  it("lists topics with unread flags and creates auto-titled topics", async () => {
    server.use(
      http.get(`${BASE}/api/v1/projects/p1/channels/c1/topics/`, () =>
        HttpResponse.json([{ id: "t1", title: "chat#1", slug: "chat1", channel_id: "c1", project_id: "p1", has_unread: true }]),
      ),
      http.post(`${BASE}/api/v1/projects/p1/channels/c1/topics/`, async ({ request }) => {
        const b = (await request.json()) as { title: string };
        return HttpResponse.json({ id: "t2", title: b.title, slug: "x", channel_id: "c1", project_id: "p1" });
      }),
    );
    const topics = await listTopics("p1", "c1");
    expect(topics[0].has_unread).toBe(true);
    const created = await createTopic("p1", "c1", nextTopicTitle(topics.map((t) => t.title)));
    expect(created.title).toBe("chat#2");
  });

  it("marks a topic read", async () => {
    server.use(http.post(`${BASE}/api/v1/projects/p1/channels/c1/topics/t1/read/`, () => HttpResponse.json({ ok: true })));
    await expect(markTopicRead("p1", "c1", "t1")).resolves.toEqual({ ok: true });
  });
});

describe("nextTopicTitle", () => {
  it("follows the chat#N convention (count + 1)", () => {
    expect(nextTopicTitle([])).toBe("chat#1");
    expect(nextTopicTitle(["chat#1", "chat#7", "renamed thing"])).toBe("chat#8");
    // archiving must not cause collisions: max+1, not count+1
    expect(nextTopicTitle(["chat#2"])).toBe("chat#3");
  });
});
