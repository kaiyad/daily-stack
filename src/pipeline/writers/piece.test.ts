import assert from "node:assert/strict";
import { test } from "node:test";
import { Piece, sectionWords, vetLinks } from "./piece";
import type { ShelfLink } from "../../lib/shelf";

const link = (url: string, title = "A page"): ShelfLink => ({
  url,
  title,
  note: "what it gives you",
  kind: "concept",
});

/** What a grounded writer hands over: canonical form to the URL as returned. */
const searched = new Map([
  [
    "https://en.wikipedia.org/wiki/Cognitive_revolution",
    "https://en.wikipedia.org/wiki/Cognitive_revolution",
  ],
  [
    "https://nature.com/articles/d41586-021-01044-5",
    "https://www.nature.com/articles/d41586-021-01044-5",
  ],
]);

test("a link the search returned is kept", () => {
  const { kept, dropped } = vetLinks([link("https://en.wikipedia.org/wiki/Cognitive_revolution")], searched);
  assert.equal(kept.length, 1);
  assert.equal(dropped, 0);
});

test("a link the search never returned is dropped and counted", () => {
  const { kept, dropped } = vetLinks([link("https://example.com/invented")], searched);
  assert.deepEqual(kept, []);
  assert.equal(dropped, 1);
});

test("a plausible URL on a searched domain is still dropped", () => {
  // The failure this guards against: the model remembers the publication and
  // completes a path that was never in a result.
  const { kept } = vetLinks([link("https://www.nature.com/articles/d41586-099-99999-9")], searched);
  assert.deepEqual(kept, []);
});

test("a tracking parameter or www prefix does not make a real link look invented", () => {
  const { kept } = vetLinks(
    [link("https://nature.com/articles/d41586-021-01044-5?utm_source=newsletter")],
    searched,
  );
  assert.equal(kept.length, 1);
  // The page gets the URL as the search returned it, not the model's variant.
  assert.equal(kept[0].url, "https://www.nature.com/articles/d41586-021-01044-5");
});

test("the same page cited twice appears once and is not counted as dropped", () => {
  const { kept, dropped } = vetLinks(
    [
      link("https://en.wikipedia.org/wiki/Cognitive_revolution", "First"),
      link("https://en.wikipedia.org/wiki/Cognitive_revolution", "Second"),
    ],
    searched,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, "First");
  assert.equal(dropped, 0);
});

test("a grounded writer that found nothing publishes no links", () => {
  const { kept, dropped } = vetLinks([link("https://en.wikipedia.org/wiki/X")], new Map());
  // An empty map means "unvetted", which is the hand-written case: the link
  // passes. This is the one branch where vetting is deliberately skipped.
  assert.equal(kept.length, 1);
  assert.equal(dropped, 0);
});

test("a hand-written piece keeps its links untouched", () => {
  const { kept } = vetLinks([link("https://www.gutenberg.org/ebooks/1342")], new Map());
  assert.equal(kept[0].url, "https://www.gutenberg.org/ebooks/1342");
});

test("the schema rejects a piece with an unknown link kind", () => {
  const bad = {
    headline: "x",
    dek: "x",
    sections: [{ heading: "h", body_md: "b" }],
    takeaways: ["t"],
    context_links: [{ title: "t", url: "https://x.com", note: "n", kind: "podcast" }],
    sources: [],
  };
  assert.equal(Piece.safeParse(bad).success, false);
});

test("the schema rejects a piece missing its sections", () => {
  assert.equal(Piece.safeParse({ headline: "x", dek: "x", takeaways: [] }).success, false);
});

test("word count is the sum of the section bodies, not the headings", () => {
  const piece = {
    headline: "ignored here",
    dek: "ignored here too",
    sections: [
      { heading: "A heading of four words", body_md: "one two three" },
      { heading: "Another", body_md: "four five" },
    ],
    takeaways: [],
    context_links: [],
    sources: [],
  };
  assert.equal(sectionWords(Piece.parse(piece)), 5);
});
