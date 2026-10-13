import { env } from "../../lib/env";
import { fetchJson } from "../../lib/http";
import { addDays, ymdInTz } from "../../lib/dates";
import { clean, type Fetcher, type RawItem } from "../types";

type Repo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  created_at: string;
  pushed_at: string;
  owner?: { login?: string };
  archived?: boolean;
  fork?: boolean;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (env.githubToken) h.authorization = `Bearer ${env.githubToken}`;
  return h;
}

/**
 * GitHub has no trending endpoint, so we approximate it two ways: repos that
 * are young and already starred, and established repos pushed in the last
 * couple of days. Day-over-day star deltas are computed at write time.
 */
export const fetchGithub: Fetcher = async () => {
  const today = ymdInTz(new Date(), "UTC");
  const queries = [
    `created:>${addDays(today, -21)} stars:>80 sort:stars`,
    `pushed:>${addDays(today, -2)} stars:>400 sort:stars`,
  ];

  const seen = new Set<string>();
  const out: RawItem[] = [];

  for (const q of queries) {
    const res = await fetchJson<{ items?: Repo[] }>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=50`,
      { headers: headers() },
    );
    for (const r of res.items ?? []) {
      if (!r.full_name || r.archived || r.fork) continue;
      if (seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      out.push({
        externalId: r.full_name,
        url: r.html_url,
        title: r.full_name,
        author: r.owner?.login,
        summaryRaw: clean(r.description),
        // Discovery time, not creation time: a repo trending today may be
        // years old, and dating it to its birth drops it from every window.
        publishedAt: new Date(),
        starsTotal: r.stargazers_count,
        slotHint: "repos",
        tags: [r.language, ...(r.topics ?? [])].filter((t): t is string => Boolean(t)).slice(0, 8),
        raw: {
          language: r.language,
          forks: r.forks_count,
          pushed_at: r.pushed_at,
          created_at: r.created_at,
          description: r.description,
        },
      });
    }
  }
  return out;
};
