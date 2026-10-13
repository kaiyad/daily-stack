import { fetchText } from "../../lib/http";
import { parseFeed } from "../feed";
import type { Fetcher, RawItem } from "../types";
import type { SlotId } from "../../lib/slots";

export const fetchRss: Fetcher = async (src) => {
  if (!src.feed_url) return [];
  const xml = await fetchText(src.feed_url, {
    headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  const items = parseFeed(xml);
  const hint = (src.slot_hint ?? undefined) as SlotId | undefined;
  return items.map<RawItem>((it) => ({
    ...it,
    slotHint: hint,
    tags: [...new Set([...(it.tags ?? []), ...src.tags])].slice(0, 8),
  }));
};
