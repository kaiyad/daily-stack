import { z } from "zod";
import { log } from "../../lib/log";
import { canonicalizeUrl } from "../../lib/url";
import { countWords, type BookRow, type ShelfLink } from "../../lib/shelf";

export const Link = z.object({
  title: z.string().describe("The page's own title, not a description of it"),
  url: z.string().describe("The exact URL from the dossier, copied character for character"),
  note: z.string().describe("One clause on what the reader gets from it, under 20 words"),
  kind: z
    .enum(["concept", "context", "review", "author", "primary-source", "adaptation"])
    .describe("What role this link plays"),
});

export const Section = z.object({
  heading: z.string().describe("Sentence case, no numbering, under 60 characters"),
  body_md: z
    .string()
    .describe(
      "The section's prose. Paragraphs separated by blank lines. **bold**, *italic* and `code` are the only markup; no headings, no lists, no links.",
    ),
});

/**
 * One schema for all three writers: the Anthropic call constrains its output to
 * it, the Gemini call is handed its JSON Schema form, and a hand-written file
 * in db/seed/shelf is validated against it before it can publish. Any writer
 * that cannot satisfy it does not get to publish.
 */
export const Piece = z.object({
  headline: z.string().describe("One line on what this book is for, under 90 characters"),
  dek: z.string().describe("Two or three sentences setting up the piece"),
  sections: z.array(Section).describe("Eight to twelve sections, in reading order"),
  takeaways: z
    .array(z.string())
    .describe("Five to eight complete sentences, each a single fact worth keeping"),
  context_links: z.array(Link).describe("Eight to sixteen links, from the dossier only"),
  sources: z.array(Link).describe("Three to eight links that back the claims in this piece"),
});

export type Piece = z.infer<typeof Piece>;

/** What a writer hands back: the piece, plus how much work it took to get it. */
export type Written = {
  piece: Piece;
  /** Canonical URL to the URL as the search returned it. Empty means unvetted. */
  urls: Map<string, string>;
  searches: number;
  model: string;
};

// The brief asks for 3500-4500 words. Well under half of that means the call
// went wrong, and a stub is worse than no piece at all.
export const MIN_WORDS = 1500;

export const RESEARCH_SYSTEM = `You assemble the link dossier for a long-form book summary. You are not writing the summary.

Search the web for, in this order of priority:
1. The book's central concepts and terms a reader would need explained - one authoritative explainer each.
2. Substantial reviews from the time of publication, and at least one critical or dissenting one.
3. The primary sources, datasets, papers or archives the book is built on.
4. The author: an interview, a lecture, or a talk where they state the argument themselves.
5. Anything that has changed since publication - a retraction, a failed replication, a revised figure, a later edition's correction.

Then write a dossier in plain text:

- One line per link: \`URL | title | kind | one clause on what it gives the reader\`, where kind is one of concept, context, review, author, primary-source, adaptation.
- Then a short section headed CRITICAL RECEPTION: what the book was praised and attacked for, who attacked it, and on what grounds.
- Then a short section headed DATED OR DISPUTED: specific claims in the book that have since been revised, with what replaced them.

Only list a URL that appeared in a search result you actually received. Do not construct, guess or complete a URL. If you could not find something for a category, write that the category is empty rather than filling it.`;

export const WRITE_SYSTEM = `You write The Weekly Shelf: one famous book a week, summarised in depth for a reader who has not read it and may never read it, but wants to genuinely understand it.

Length: 3500-4500 words across eight to twelve sections. This is the long version on purpose.

Shape the piece roughly like this, with your own headings:
- What the book is, and the question it set out to answer.
- The argument, stated plainly in a paragraph before anything is elaborated.
- A walkthrough of the book's own structure across several sections - its parts or chapter groups in order, with the actual content of each: the cases, the numbers, the experiments, the stories it uses to make its point. This is the bulk of the piece.
- The concepts a reader needs, defined properly where they first matter.
- The evidence, and how strong it actually is.
- Where it has been challenged, by whom, and whether the challenge landed.
- What has changed since it was published.
- How to read it: what to read closely, what to skim, what the best edition is.

Rules, all hard:
- Your own words throughout. Never quote more than a short phrase, and never more than twice in the whole piece; this is a summary, not a reproduction. Do not reproduce passages, poems, lyrics or long extracts.
- Specific over general. Name the chapter, the study, the year, the figure. "He gives several examples" is a wasted sentence; give the examples.
- State what the book claims as the book's claim, and what is contested as contested. Where the dossier records a dispute, say so in the body, not only at the end.
- No hype words, no "in today's fast-paced world", no "this book will change how you think", no second-person pep talk, no closing exhortation to read it.
- body_md carries paragraphs separated by blank lines. No headings inside a section, no bullet lists, no markdown links.
- Every url in context_links and sources must be copied exactly from the dossier. Never write a URL that is not in the dossier, even one you are confident about.`;

export function researchPrompt(book: BookRow): string {
  const year = book.year ? ` (${book.year})` : "";
  return `Build the dossier for ${book.title} by ${book.author}${year}. The piece it feeds will cover: ${book.pitch}`;
}

export function writePrompt(book: BookRow, dossier: string): string {
  const year = book.year ? `, published ${book.year}` : "";
  return [
    `Write this week's piece on ${book.title} by ${book.author}${year}.`,
    `The angle to hold: ${book.pitch}`,
    "",
    "## Dossier",
    dossier,
  ].join("\n");
}

/**
 * Drops any link the search did not actually return, and dedupes the rest.
 * This is the whole guarantee behind the links on the page, so it trusts the
 * canonical form of a URL and nothing else about it. An empty `urls` means the
 * writer vouched for its own links - a hand-written file - and they pass
 * through.
 */
export function vetLinks(
  links: ShelfLink[],
  urls: Map<string, string>,
): { kept: ShelfLink[]; dropped: number } {
  const seen = new Set<string>();
  const kept: ShelfLink[] = [];
  let dropped = 0;

  for (const link of links) {
    const canonical = canonicalizeUrl(link.url);
    if (seen.has(canonical)) continue;

    const real = urls.size ? urls.get(canonical) : link.url;
    if (!real) {
      log.warn(`dropped unsearched link ${link.url}`);
      dropped++;
      continue;
    }

    seen.add(canonical);
    kept.push({ ...link, url: real, title: link.title.trim(), note: link.note.trim() });
  }

  return { kept, dropped };
}

export function sectionWords(piece: Piece): number {
  return piece.sections.reduce((n, s) => n + countWords(s.body_md), 0);
}
