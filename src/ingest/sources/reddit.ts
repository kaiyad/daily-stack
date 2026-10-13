import { env } from "../../lib/env";
import { fetchJson, fetchRaw } from "../../lib/http";
import { clean, type Fetcher, type RawItem } from "../types";

type Listing = {
  data?: {
    children?: {
      data?: {
        id: string;
        title: string;
        url?: string;
        permalink: string;
        author?: string;
        selftext?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
        is_self?: boolean;
        over_18?: boolean;
        stickied?: boolean;
        link_flair_text?: string | null;
        subreddit?: string;
      };
    }[];
  };
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function appToken(): Promise<string | null> {
  if (!env.redditClientId || !env.redditClientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const basic = Buffer.from(`${env.redditClientId}:${env.redditClientSecret}`).toString("base64");
  const res = await fetchRaw("https://www.reddit.com/api/v1/access_token", {
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`reddit auth ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("reddit auth returned no token");
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** `feed_url` holds the subreddit name, e.g. "programming". */
export const fetchReddit: Fetcher = async (src) => {
  const sub = src.feed_url;
  if (!sub) return [];

  const token = await appToken();
  const path = `/r/${sub}/top?t=day&limit=30&raw_json=1`;
  const listing = token
    ? await fetchJson<Listing>(`https://oauth.reddit.com${path}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    : await fetchJson<Listing>(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=30&raw_json=1`);

  const out: RawItem[] = [];
  for (const child of listing.data?.children ?? []) {
    const d = child.data;
    if (!d || !d.title || d.over_18 || d.stickied) continue;
    const discussionUrl = `https://reddit.com${d.permalink}`;
    out.push({
      externalId: d.id,
      url: d.is_self || !d.url ? discussionUrl : d.url,
      title: d.title,
      author: d.author,
      summaryRaw: clean(d.selftext),
      discussionUrl,
      publishedAt: new Date((d.created_utc ?? Date.now() / 1000) * 1000),
      points: d.score ?? 0,
      comments: d.num_comments ?? 0,
      tags: [d.subreddit, d.link_flair_text].filter((t): t is string => Boolean(t)),
      raw: { subreddit: d.subreddit },
    });
  }
  return out;
};
