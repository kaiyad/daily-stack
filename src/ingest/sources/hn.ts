import { fetchJson, mapLimit } from "../../lib/http";
import { clean, type Fetcher, type RawItem } from "../types";

type HnItem = {
  id: number;
  by?: string;
  score?: number;
  descendants?: number;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
  text?: string;
  dead?: boolean;
  deleted?: boolean;
};

const BASE = "https://hacker-news.firebaseio.com/v0";
const MIN_SCORE = 40;
const CANDIDATES = 180;

export const fetchHn: Fetcher = async () => {
  const [top, best] = await Promise.all([
    fetchJson<number[]>(`${BASE}/topstories.json`),
    fetchJson<number[]>(`${BASE}/beststories.json`),
  ]);

  const ids = [...new Set([...top.slice(0, CANDIDATES), ...best.slice(0, 60)])];
  const items = await mapLimit(ids, 12, (id) =>
    fetchJson<HnItem | null>(`${BASE}/item/${id}.json`).catch(() => null),
  );

  const out: RawItem[] = [];
  for (const it of items) {
    if (!it || it.dead || it.deleted) continue;
    if (it.type !== "story" || !it.title) continue;
    if ((it.score ?? 0) < MIN_SCORE) continue;

    const discussionUrl = `https://news.ycombinator.com/item?id=${it.id}`;
    out.push({
      externalId: String(it.id),
      // A self-post's story *is* the thread, so the thread is the target.
      url: it.url || discussionUrl,
      title: it.title,
      author: it.by,
      summaryRaw: clean(it.text),
      discussionUrl,
      publishedAt: new Date((it.time ?? Date.now() / 1000) * 1000),
      points: it.score ?? 0,
      comments: it.descendants ?? 0,
      raw: { hn_id: it.id },
    });
  }
  return out;
};
