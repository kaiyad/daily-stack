import { fetchJson } from "../../lib/http";
import { clean, type Fetcher, type RawItem } from "../types";

type LobsterStory = {
  short_id: string;
  created_at: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  comments_url: string;
  description_plain?: string;
  submitter_user?: string | { username?: string };
  tags?: string[];
};

export const fetchLobsters: Fetcher = async (src) => {
  const url = src.feed_url ?? "https://lobste.rs/hottest.json";
  const stories = await fetchJson<LobsterStory[]>(url);

  return stories
    .filter((s) => s.title)
    .map<RawItem>((s) => ({
      externalId: s.short_id,
      url: s.url || s.comments_url,
      title: s.title,
      author:
        typeof s.submitter_user === "string" ? s.submitter_user : s.submitter_user?.username,
      summaryRaw: clean(s.description_plain),
      discussionUrl: s.comments_url,
      publishedAt: new Date(s.created_at),
      points: s.score ?? 0,
      comments: s.comment_count ?? 0,
      tags: s.tags ?? [],
      raw: { lobsters_id: s.short_id },
    }));
};
