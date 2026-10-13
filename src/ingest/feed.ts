import { XMLParser } from "fast-xml-parser";
import { clean, type RawItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  textNodeName: "#text",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec["#text"] === "string") return rec["#text"];
    if (typeof rec["@_href"] === "string") return rec["@_href"];
  }
  return undefined;
}

/** Atom entries can carry several <link>s; the alternate one is the article. */
function atomLink(entry: Record<string, unknown>): string | undefined {
  const links = asArray(entry.link as unknown);
  const typed = links
    .map((l) => (typeof l === "object" && l ? (l as Record<string, unknown>) : null))
    .filter((l): l is Record<string, unknown> => Boolean(l));
  const alt = typed.find((l) => l["@_rel"] === "alternate" || l["@_rel"] === undefined);
  return (alt?.["@_href"] as string) ?? textOf(links[0]);
}

function parseDate(...candidates: (string | undefined)[]): Date {
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date();
}

/** Parses RSS 2.0, RDF and Atom into a common shape. */
export function parseFeed(xml: string): RawItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const out: RawItem[] = [];

  const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"] ?? undefined;
  if (channel) {
    for (const it of asArray<Record<string, any>>(channel.item)) {
      const link = textOf(it.link) ?? textOf(it["@_rdf:about"]) ?? textOf(it.guid);
      const title = textOf(it.title);
      if (!link || !title) continue;
      out.push({
        externalId: textOf(it.guid) ?? link,
        url: link,
        title: clean(title, 300)!,
        author: textOf(it["dc:creator"]) ?? textOf(it.author),
        summaryRaw: clean(textOf(it["content:encoded"]) ?? textOf(it.description)),
        publishedAt: parseDate(textOf(it.pubDate), textOf(it["dc:date"])),
        tags: asArray(it.category).map((c) => textOf(c) ?? "").filter(Boolean).slice(0, 6),
      });
    }
    return out;
  }

  const feed = doc?.feed;
  if (feed) {
    for (const e of asArray<Record<string, any>>(feed.entry)) {
      const link = atomLink(e);
      const title = textOf(e.title);
      if (!link || !title) continue;
      const author = asArray<Record<string, any>>(e.author)[0];
      out.push({
        externalId: textOf(e.id) ?? link,
        url: link,
        title: clean(title, 300)!,
        author: textOf(author?.name),
        summaryRaw: clean(textOf(e.summary) ?? textOf(e.content)),
        publishedAt: parseDate(textOf(e.published), textOf(e.updated)),
        tags: asArray(e.category)
          .map((c) => (typeof c === "object" && c ? (c as any)["@_term"] : undefined))
          .filter((t): t is string => Boolean(t))
          .slice(0, 6),
      });
    }
  }
  return out;
}
