import { pool, query } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/log";
import { currentShelfDate } from "../lib/shelf";
import { pickWriter } from "../pipeline/shelf";
import { DIR, writtenSlugs } from "../pipeline/writers/prewritten";
import { Piece } from "../pipeline/writers/piece";
import fs from "node:fs";

type Row = { d: string; slug: string; title: string; genre: string; published: boolean };

/**
 * What the next weeks will publish, and how. The point of the report is the
 * `fallback` column: a Friday that says anything other than `written` will be
 * generated on the night, which is the cue to write a few more pieces.
 */
async function main(): Promise<void> {
  const weeks = Number(process.argv[2] ?? 13);
  const from = currentShelfDate();

  const scheduled = await query<Row>(
    `select to_char(b.scheduled_date,'YYYY-MM-DD') as d, b.slug, b.title, b.genre,
            (s.shelf_date is not null and s.status = 'frozen') as published
       from books b
       left join shelf_editions s on s.book_id = b.id
      where b.scheduled_date >= $1
      order by b.scheduled_date
      limit $2`,
    [from, weeks],
  );

  // A committed file that no longer parses is worse than a missing one: the
  // build throws on the night instead of falling back, so it is reported as a
  // gap rather than as cover.
  const invalid = new Set<string>();
  for (const slug of writtenSlugs()) {
    const parsed = Piece.safeParse(JSON.parse(fs.readFileSync(`${DIR}/${slug}.json`, "utf8")));
    if (parsed.success) continue;
    invalid.add(slug);
    const issue = parsed.error.issues[0];
    log.error(
      `${DIR}/${slug}.json is invalid: ${issue?.path.join(".") || "(root)"}: ${issue?.message}`,
    );
  }

  let gaps = 0;
  for (const row of scheduled) {
    const by = row.published
      ? "published"
      : invalid.has(row.slug)
        ? "INVALID"
        : (pickWriter(row.slug)?.provenance ?? "NOTHING");
    if (!row.published && by !== "written") gaps++;
    log.info(`${row.d}  ${by.padEnd(10)} ${row.genre.padEnd(12)} ${row.slug}`);
  }

  const written = writtenSlugs().filter((slug) => !invalid.has(slug)).length;
  log.info(
    `${written} piece(s) written, ${gaps} of the next ${scheduled.length} Fridays will fall back`,
  );
  if (gaps) {
    log.warn(
      env.anthropicKey || env.geminiKey
        ? "those Fridays will be generated - write them ahead if you want them better"
        : "those Fridays will publish NOTHING - no key is set and no piece is written",
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
