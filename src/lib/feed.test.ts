import assert from "node:assert/strict";
import { test } from "node:test";
import { atomFeed, xmlEscape } from "./feed";
import type { Edition, EntryRow } from "./editions";

function entry(over: Partial<EntryRow> = {}): EntryRow {
  return {
    slot: "reads",
    rank: 1,
    cluster_id: "1",
    title: "Title",
    url: "https://example.com/a",
    domain: "example.com",
    source_label: "Example",
    summary: null,
    why: null,
    tags: [],
    mention_count: 1,
    discussion_url: null,
    points: null,
    comments: null,
    published_at: null,
    ...over,
  };
}

function edition(over: Partial<Edition> = {}): Edition {
  return {
    date: "2026-10-16",
    status: "frozen",
    sections: [{ slot: "reads", label: "Top Reads", blurb: "", entries: [entry()] }],
    revisions: [],
    entryCount: 1,
    ...over,
  };
}

const feed = (editions: Edition[]) =>
  atomFeed({ siteUrl: "https://stack.test", title: "T", subtitle: "S", editions });

test("every edition becomes one entry linking to its own page", () => {
  const xml = feed([edition(), edition({ date: "2026-10-15" })]);
  assert.equal(xml.match(/<entry>/g)?.length, 2);
  assert.ok(xml.includes("<link href=\"https://stack.test/2026-10-16\"/>"));
  assert.ok(xml.includes("<id>https://stack.test/2026-10-15</id>"));
});

test("the feed is updated as of its newest edition", () => {
  const xml = feed([edition({ date: "2026-10-16" }), edition({ date: "2026-10-01" })]);
  assert.ok(xml.includes("  <updated>2026-10-16T00:00:00Z</updated>"));
});

test("an empty archive still produces a well-formed feed", () => {
  const xml = feed([]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(xml.trimEnd().endsWith("</feed>"));
  assert.ok(!xml.includes("<entry>"));
});

test("a title carrying markup cannot break out of the entry", () => {
  const xml = feed([
    edition({
      sections: [
        {
          slot: "reads",
          label: "Top Reads",
          blurb: "",
          entries: [entry({ title: 'C++ & "</content>" <script>' })],
        },
      ],
    }),
  ]);
  assert.ok(!xml.includes("<script>"));
  assert.ok(!/<\/content>.*<\/content>/s.test(xml.split("<entry>")[1] ?? ""));
  assert.ok(xml.includes("C++ &amp;amp; "));
});

test("escaping covers every character XML reserves", () => {
  assert.equal(xmlEscape(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;");
});
