import fs from "node:fs";
import { pool } from "../lib/db";
import { log } from "../lib/log";

type SeedBook = {
  slug: string;
  title: string;
  author: string;
  year?: number | null;
  genre: string;
  pitch: string;
};

/**
 * Kept out of `db:seed` on purpose: the shelf catalogue is refilled on its own
 * cadence, and re-running it must never be a reason to touch sources or
 * concepts. A book already pinned to a date keeps that date.
 */
async function main(): Promise<void> {
  const books: SeedBook[] = JSON.parse(fs.readFileSync("db/seed/books.json", "utf8"));

  for (const b of books) {
    await pool.query(
      `insert into books (slug, title, author, year, genre, pitch)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (slug) do update set
         title = excluded.title, author = excluded.author, year = excluded.year,
         genre = excluded.genre, pitch = excluded.pitch`,
      [b.slug, b.title, b.author, b.year ?? null, b.genre, b.pitch],
    );
  }

  const { rows } = await pool.query<{ total: string; pending: string }>(
    `select count(*) as total, count(*) filter (where scheduled_date is null) as pending from books`,
  );
  log.info(`${books.length} books seeded; ${rows[0].pending} of ${rows[0].total} unscheduled`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
