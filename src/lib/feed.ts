import { formatEditionDate } from "./dates";
import type { Edition } from "./editions";

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * One Atom entry per edition, carrying the whole edition as HTML. A reader
 * subscribing to a daily that only syndicated headlines would have to open
 * nineteen tabs to use it; an edition is already a finished page, so it is
 * shipped whole and the feed is a real way to read this.
 *
 * Hand-rolled rather than templated: it is forty lines, and a frozen edition
 * is the one kind of input that can never change under the serialiser.
 */
export function atomFeed(opts: {
  siteUrl: string;
  title: string;
  subtitle: string;
  editions: Edition[];
}): string {
  const { siteUrl, title, subtitle, editions } = opts;
  const updated = editions[0] ? isoDay(editions[0].date) : new Date().toISOString();

  const entries = editions.map((edition) => {
    const url = `${siteUrl}/${edition.date}`;
    const top = edition.sections[0]?.entries[0]?.title;
    const summary = [
      edition.concept ? `${edition.concept.title} · ` : "",
      `${edition.entryCount} entries`,
      top ? ` · ${top}` : "",
    ].join("");

    return [
      "  <entry>",
      `    <title>${xmlEscape(formatEditionDate(edition.date))}</title>`,
      `    <id>${xmlEscape(url)}</id>`,
      `    <link href="${xmlEscape(url)}"/>`,
      `    <updated>${isoDay(edition.date)}</updated>`,
      `    <summary>${xmlEscape(summary)}</summary>`,
      `    <content type="html">${xmlEscape(editionHtml(edition, url))}</content>`,
      "  </entry>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${xmlEscape(title)}</title>`,
    `  <subtitle>${xmlEscape(subtitle)}</subtitle>`,
    `  <id>${xmlEscape(siteUrl)}/</id>`,
    // Atom requires an author somewhere; at feed level it covers every entry.
    `  <author><name>${xmlEscape(title)}</name></author>`,
    `  <link href="${xmlEscape(siteUrl)}/"/>`,
    `  <link rel="self" type="application/atom+xml" href="${xmlEscape(siteUrl)}/feed.xml"/>`,
    `  <updated>${updated}</updated>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}

function editionHtml(edition: Edition, url: string): string {
  const parts: string[] = [];

  if (edition.concept) {
    parts.push(
      `<h2>${h(edition.concept.title)}</h2><p><em>${h(edition.concept.one_liner)}</em></p>`,
    );
  }

  for (const section of edition.sections) {
    parts.push(`<h3>${h(section.label)}</h3><ul>`);
    for (const entry of section.entries) {
      const meta = h(entry.domain);
      const blurb = entry.summary ? ` — ${h(entry.summary)}` : "";
      parts.push(`<li><a href="${h(entry.url)}">${h(entry.title)}</a> <small>${meta}</small>${blurb}</li>`);
    }
    parts.push("</ul>");
  }

  parts.push(`<p><a href="${h(url)}">Read this edition on the web</a></p>`);
  return parts.join("");
}

/** HTML-escaping inside the content payload, which is then XML-escaped whole. */
function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isoDay(ymd: string): string {
  return `${ymd}T00:00:00Z`;
}
