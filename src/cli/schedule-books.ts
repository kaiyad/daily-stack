import { pool, query } from "../lib/db";
import { log } from "../lib/log";
import { currentShelfDate, nextFriday, type BookRow } from "../lib/shelf";

type Pending = Pick<BookRow, "id" | "slug" | "genre">;

/**
 * Tops the schedule up to N Fridays of runway, never twice the same genre in a
 * row, so a quarter of the shelf is visible ahead of time instead of being
 * decided the night it publishes.
 *
 * It is a horizon, not a batch: the weekly job runs this every Friday, and a
 * run that assigned N more books each time would empty a 52-book catalogue
 * inside a month. Re-running it with nothing to fill does nothing.
 */
async function main(): Promise<void> {
  const weeks = Number(process.argv[2] ?? 13);

  const taken = new Set(
    (
      await query<{ d: string }>(
        `select to_char(scheduled_date,'YYYY-MM-DD') as d from books where scheduled_date is not null`,
      )
    ).map((r) => r.d),
  );

  const last = await query<{ genre: string }>(
    `select genre from books where scheduled_date is not null order by scheduled_date desc limit 1`,
  );

  const pending = await query<Pending>(
    `select id, slug, genre from books where scheduled_date is null order by id`,
  );

  // Starts at the current shelf date, not after it: that is the Friday
  // `npm run shelf` builds, and a horizon that skipped it would leave the
  // builder back-filling a title the schedule never chose.
  const fridays: string[] = [];
  let cursor = currentShelfDate();
  for (let i = 0; i < weeks; i++) {
    fridays.push(cursor);
    cursor = nextFriday(cursor);
  }

  let previousGenre = last[0]?.genre ?? "";
  let assigned = 0;

  for (const friday of fridays) {
    if (taken.has(friday)) {
      // Already pinned, by an earlier run or by hand. Its genre is what the
      // next free Friday has to differ from.
      const held = await query<{ genre: string }>(
        `select genre from books where scheduled_date = $1`,
        [friday],
      );
      previousGenre = held[0]?.genre ?? previousGenre;
      continue;
    }

    // The next title whose genre differs from last week's; if every remaining
    // book shares that genre, publish it anyway - a gap is worse than a repeat.
    const at = pending.findIndex((b) => b.genre !== previousGenre);
    const book = pending.splice(at === -1 ? 0 : at, 1)[0];
    if (!book) break;

    await query(`update books set scheduled_date = $2 where id = $1`, [book.id, friday]);
    log.info(`${friday}  ${book.genre.padEnd(12)} ${book.slug}`);
    taken.add(friday);
    previousGenre = book.genre;
    assigned++;
  }

  log.info(
    assigned
      ? `${assigned} scheduled, ${pending.length} books left in the catalogue`
      : `already ${weeks} Fridays deep, ${pending.length} books left in the catalogue`,
  );
  if (pending.length < 13) log.warn("under a quarter of runway - refill db/seed/books.json");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
