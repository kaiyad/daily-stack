import type { SlotId } from "../lib/slots";

export type SourceRow = {
  id: number;
  slug: string;
  name: string;
  kind: "hn" | "rss" | "github" | "lobsters" | "arxiv" | "reddit";
  feed_url: string | null;
  trust_weight: number;
  slot_hint: string | null;
  tags: string[];
};

export type RawItem = {
  externalId?: string;
  url: string;
  title: string;
  author?: string;
  summaryRaw?: string;
  discussionUrl?: string;
  publishedAt: Date;
  points?: number;
  comments?: number;
  starsTotal?: number;
  slotHint?: SlotId;
  tags?: string[];
  raw?: Record<string, unknown>;
};

export type Fetcher = (src: SourceRow) => Promise<RawItem[]>;

export function clean(text: string | undefined | null, max = 600): string | undefined {
  if (!text) return undefined;
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.slice(0, max) : undefined;
}
