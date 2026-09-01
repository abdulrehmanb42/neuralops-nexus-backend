import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GithubStatsCard } from "./github-stats";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const res = (body: unknown, link?: string) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
    headers: { get: (h: string) => (h === "Link" ? link ?? null : null) },
  } as unknown as Response);

describe("GithubStatsCard", () => {
  it("renders live stars/forks/commits from the GitHub API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      return url.includes("/commits")
        ? res(null, '<https://api.github.com/repositories/1/commits?per_page=1&page=342>; rel="last"')
        : res({ stargazers_count: 1234, forks_count: 56 });
    });
    render(<GithubStatsCard />);
    expect(await screen.findByText("1.2k")).toBeInTheDocument(); // stars, formatted
    expect(screen.getByText("56")).toBeInTheDocument(); // forks
    expect(screen.getByText("342")).toBeInTheDocument(); // commits, from the Link header
  });

  it("keeps the link but shows dashes when the API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rate limited"));
    render(<GithubStatsCard />);
    expect(screen.getByRole("link", { name: /view on github/i })).toBeInTheDocument();
    expect((await screen.findAllByText("—")).length).toBeGreaterThan(0);
  });
});
