import { fetchText } from "../../lib/http";
import { parseFeed } from "../feed";
import type { Fetcher, RawItem } from "../types";

const DEFAULT =
  "http://export.arxiv.org/api/query?search_query=" +
  encodeURIComponent("cat:cs.DC OR cat:cs.SE OR cat:cs.PL OR cat:cs.DB OR cat:cs.OS") +
  "&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending";

export const fetchArxiv: Fetcher = async (src) => {
  const xml = await fetchText(src.feed_url ?? DEFAULT);
  return parseFeed(xml).map<RawItem>((it) => ({
    ...it,
    slotHint: "deep",
    tags: [...new Set([...(it.tags ?? []), "paper"])].slice(0, 8),
  }));
};
