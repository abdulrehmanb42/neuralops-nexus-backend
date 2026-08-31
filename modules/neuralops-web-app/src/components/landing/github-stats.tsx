"use client";

import { useEffect, useState } from "react";
import { GitFork, GitCommitHorizontal, Star } from "lucide-react";

const REPO = "mapax-io/neuralops-nexus";
export const REPO_URL = `https://github.com/${REPO}`;

// lucide no longer ships a GitHub brand icon — inline the mark (fill inherits
// currentColor). A logo, not an emoji.
function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export interface RepoStats {
  stars: number | null;
  forks: number | null;
  commits: number | null;
  loaded: boolean;
}

const fmt = (n: number | null) =>
  n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

// Live repo stats from the public GitHub API. Best-effort: unauthenticated
// requests are rate-limited (60/hr/IP), so on any failure we keep the link and
// simply drop the numbers. setState runs after the awaits, not in the effect
// body, so it's clear of the set-state-in-effect rule.
export function useRepoStats(): RepoStats {
  const [stats, setStats] = useState<RepoStats>({ stars: null, forks: null, commits: null, loaded: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      let stars: number | null = null;
      let forks: number | null = null;
      let commits: number | null = null;
      try {
        const repo = await fetch(`https://api.github.com/repos/${REPO}`).then((r) => (r.ok ? r.json() : null));
        if (repo) {
          stars = typeof repo.stargazers_count === "number" ? repo.stargazers_count : null;
          forks = typeof repo.forks_count === "number" ? repo.forks_count : null;
        }
        // Total commits = last page number when paging one commit at a time.
        const res = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`);
        const m = res.headers.get("Link")?.match(/[?&]page=(\d+)>;\s*rel="last"/);
        if (m) commits = Number(m[1]);
      } catch {
        /* offline / rate-limited — the link still works without numbers */
      }
      if (alive) setStats({ stars, forks, commits, loaded: true });
    })();
    return () => { alive = false; };
  }, []);
  return stats;
}

// Compact header link: the GitHub mark + a star count once it loads.
export function GithubNavLink() {
  const { stars } = useRepoStats();
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="NeuralOps Nexus on GitHub"
      className="hidden h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface/80 px-3 text-[13px] font-semibold text-ink2 backdrop-blur transition-colors hover:border-accent hover:text-ink sm:inline-flex"
    >
      <GithubMark size={15} />
      <span className="hidden md:inline">GitHub</span>
      {stars != null && (
        <span className="inline-flex items-center gap-1 border-l border-line pl-1.5 tabular-nums">
          <Star size={12} strokeWidth={2} className="text-accent" /> {fmt(stars)}
        </span>
      )}
    </a>
  );
}

// GitHub-native "social count" widget: the repo header plus bordered
// two-segment counters (icon+label | count), the way GitHub renders its own
// Star/Fork buttons — neutral, not the app accent.
export function GithubStatsCard() {
  const { stars, forks, commits, loaded } = useRepoStats();
  const counts = [
    { icon: Star, label: "Star", value: stars },
    { icon: GitFork, label: "Fork", value: forks },
    { icon: GitCommitHorizontal, label: "Commits", value: commits },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-none text-ink"><GithubMark size={24} /></span>
        <div className="min-w-0 flex-1">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="font-display text-[16px] font-bold text-ink hover:text-accent hover:underline"
          >
            mapax-io/neuralops-nexus
          </a>
          <p className="mt-0.5 text-[13px] text-ink2">AGPL-3.0 · open core · contributions welcome.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {counts.map(({ icon: Icon, label, value }) => (
              <a
                key={label}
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-stretch overflow-hidden rounded-md border border-line text-[12px] font-semibold transition-colors hover:border-ink2"
              >
                <span className="flex items-center gap-1.5 bg-surface2 px-2.5 py-1 text-ink2">
                  <Icon size={13} strokeWidth={2} /> {label}
                </span>
                <span className="flex items-center border-l border-line bg-surface px-2.5 py-1 tabular-nums text-ink">
                  {loaded ? fmt(value) : "···"}
                </span>
              </a>
            ))}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface2 px-3 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-ink2 hover:bg-surface"
            >
              <Star size={13} strokeWidth={2} /> Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
