import { one, query } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/log";
import { domainOf } from "../lib/url";
import { currentShelfDate, nextFriday, type BookRow, type Provenance, type ShelfRow } from "../lib/shelf";
import { MIN_WORDS, sectionWords, vetLinks, type Written } from "./writers/piece";
import * as prewritten from "./writers/prewritten";
import * as claude from "./writers/claude";
import * as gemini from "./writers/gemini";

/**
 * The book for a date: whatever is already pinned to it, else the next
 * unscheduled title whose genre differs from last week's, so the shelf does
 * not run three economics books in a row. `npm run shelf:schedule` normally
 * pins these well ahead of time.
 */
export async function assignBook(shelfDate: string): Promise<BookRow | undefined> {
  const existing = await one<BookRow>(`select * from books where scheduled_date = $1`, [shelfDate]);
  if (existing) return existing;

  const previous = await one<{ genre: string }>(
    `select genre from books where scheduled_date is not null and scheduled_date < $1
      order by scheduled_date desc limit 1`,
    [shelfDate],
  );

  return await one<BookRow>(
    `update books set scheduled_date = $1
      where id = (
        select id from books where scheduled_date is null
         order by (genre = $2), id limit 1
      )
      returning *`,
    [shelfDate, previous?.genre ?? ""],
  );
}

export type Writer = { provenance: Provenance; write: (book: BookRow) => Promise<Written> };

/**
 * Whether any writer could run at all. Checked before a book is assigned, so a
 * run with no key and no committed piece does not burn a catalogue slot on a
 * date it cannot publish.
 */
export function canWrite(): boolean {
  return prewritten.writtenSlugs().length > 0 || Boolean(env.anthropicKey || env.geminiKey);
}

/**
 * Who writes this week's piece. A piece committed to the repo always wins: it
 * was written with a human in the loop and its links were checked by hand. The
 * model paths exist so a Friday with an empty queue still publishes, and they
 * are tried best-first.
 */
export function pickWriter(slug: string): Writer | undefined {
  if (prewritten.hasPiece(slug)) return { provenance: "written", write: prewritten.readPiece };
  if (env.anthropicKey) return { provenance: "claude", write: claude.write };
  if (env.geminiKey) return { provenance: "gemini", write: gemini.write };
  return undefined;
}

export type BuildResult = {
  shelfDate: string;
  slug: string;
  provenance: Provenance;
  words: number;
  links: number;
  sources: number;
  dropped: number;
  status: "draft" | "frozen";
};

/** Writes the week's piece and, with `freeze`, publishes it for good. */
export async function buildShelf(
  shelfDate: string,
  opts: { freeze?: boolean } = {},
): Promise<BuildResult | undefined> {
  const existing = await one<ShelfRow>(`select * from shelf_editions where shelf_date = $1`, [
    shelfDate,
  ]);
  if (existing?.status === "frozen") {
    log.info(`shelf ${shelfDate} is already frozen (${existing.slug})`);
    return {
      shelfDate,
      slug: existing.slug,
      provenance: existing.provenance,
      words: existing.word_count,
      links: existing.context_links.length,
      sources: existing.sources.length,
      dropped: existing.links_dropped,
      status: "frozen",
    };
  }

  if (!canWrite()) {
    log.warn(
      "nothing can write a piece: db/seed/shelf is empty and neither " +
        "ANTHROPIC_API_KEY nor GEMINI_API_KEY is set",
    );
    return undefined;
  }

  const scheduled = await one<BookRow>(`select * from books where scheduled_date = $1`, [
    shelfDate,
  ]);
  // A past Friday with no book pinned to it is a Friday the shelf missed.
  // Back-filling it with a fresh title would spend a catalogue slot on a date
  // nobody is reading, so it is skipped instead.
  if (!scheduled && shelfDate < currentShelfDate()) {
    log.warn(
      `no book was scheduled for ${shelfDate} and it has passed - ` +
        `run npm run shelf:schedule, or pass --date ${nextFriday(shelfDate)}`,
    );
    return undefined;
  }

  const book = scheduled ?? (await assignBook(shelfDate));
  if (!book) {
    log.warn(`no unscheduled books left for ${shelfDate} - refill db/seed/books.json`);
    return undefined;
  }

  const writer = pickWriter(book.slug);
  if (!writer) {
    log.warn(
      `no way to write ${book.slug}: no db/seed/shelf/${book.slug}.json, ` +
        "and neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set",
    );
    return undefined;
  }

  log.info(`${shelfDate}  ${book.slug}  via ${writer.provenance}`);
  const written = await writer.write(book);

  const sections = written.piece.sections.map((s) => ({
    heading: s.heading.trim(),
    body_md: s.body_md.trim(),
  }));
  const words = sectionWords(written.piece);
  const links = vetLinks(written.piece.context_links, written.urls);
  const sources = vetLinks(written.piece.sources, written.urls);

  if (!sections.length) throw new Error("the piece has no sections");
  if (words < MIN_WORDS) {
    throw new Error(`the piece is only ${words} words - too short to publish`);
  }

  await query(
    `insert into shelf_editions
       (shelf_date, book_id, provenance, slug, title, author, year, genre, headline, dek,
        sections, takeaways, context_links, sources, word_count, searches, links_dropped,
        model, built_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
     on conflict (shelf_date) do update set
       book_id = excluded.book_id, provenance = excluded.provenance, slug = excluded.slug,
       title = excluded.title, author = excluded.author, year = excluded.year,
       genre = excluded.genre, headline = excluded.headline, dek = excluded.dek,
       sections = excluded.sections, takeaways = excluded.takeaways,
       context_links = excluded.context_links, sources = excluded.sources,
       word_count = excluded.word_count, searches = excluded.searches,
       links_dropped = excluded.links_dropped, model = excluded.model, built_at = now()`,
    [
      shelfDate,
      book.id,
      writer.provenance,
      book.slug,
      book.title,
      book.author,
      book.year,
      book.genre,
      written.piece.headline.trim(),
      written.piece.dek.trim(),
      JSON.stringify(sections),
      written.piece.takeaways.map((t) => t.trim()).filter(Boolean),
      JSON.stringify(links.kept),
      JSON.stringify(sources.kept),
      words,
      written.searches,
      links.dropped + sources.dropped,
      written.model,
    ],
  );

  if (opts.freeze) {
    await query(
      `update shelf_editions set status = 'frozen', frozen_at = now() where shelf_date = $1`,
      [shelfDate],
    );
  }

  log.info(
    `${shelfDate}  ${book.slug}  ${words} words, ${links.kept.length} links ` +
      `(${new Set(links.kept.map((l) => domainOf(l.url))).size} domains), ` +
      `${sources.kept.length} sources, ${links.dropped + sources.dropped} dropped`,
  );

  return {
    shelfDate,
    slug: book.slug,
    provenance: writer.provenance,
    words,
    links: links.kept.length,
    sources: sources.kept.length,
    dropped: links.dropped + sources.dropped,
    status: opts.freeze ? "frozen" : "draft",
  };
}

export async function getShelf(slug: string): Promise<ShelfRow | undefined> {
  return await one<ShelfRow>(
    // The alias shadows the date column, so every reference to it is
    // qualified: an unqualified one is ambiguous and Postgres rejects it.
    `select s.*, to_char(s.shelf_date, 'YYYY-MM-DD') as shelf_date
       from shelf_editions s where s.slug = $1 and s.status = 'frozen'`,
    [slug],
  );
}

export async function listShelf(): Promise<ShelfRow[]> {
  return await query<ShelfRow>(
    `select s.*, to_char(s.shelf_date, 'YYYY-MM-DD') as shelf_date
       from shelf_editions s where s.status = 'frozen' order by s.shelf_date desc`,
  );
}
