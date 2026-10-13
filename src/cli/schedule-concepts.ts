import { pool, query } from "../lib/db";
import { log } from "../lib/log";
import { addDays, currentEditionDate } from "../lib/dates";

/**
 * Pins the next N unscheduled concepts to the next N unscheduled dates, so the
 * curriculum order is visible ahead of time instead of being decided at build.
 */
async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 30);
  const start = currentEditionDate();

  const taken = new Set(
    (
      await query<{ d: string }>(
        `select to_char(scheduled_date,'YYYY-MM-DD') as d from concepts where scheduled_date is not null`,
      )
    ).map((r) => r.d),
  );

  const pending = await query<{ id: number; slug: string }>(
    `select id, slug from concepts where scheduled_date is null order by id limit $1`,
    [days],
  );

  let cursor = start;
  let assigned = 0;
  for (const c of pending) {
    while (taken.has(cursor)) cursor = addDays(cursor, 1);
    await query(`update concepts set scheduled_date = $2 where id = $1`, [c.id, cursor]);
    log.info(`${cursor}  ${c.slug}`);
    taken.add(cursor);
    assigned++;
  }

  const remaining = await query<{ n: string }>(
    `select count(*)::text as n from concepts where scheduled_date is null`,
  );
  log.info(`${assigned} scheduled, ${remaining[0].n} concepts still unscheduled`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
