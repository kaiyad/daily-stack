import { pool, one } from "../lib/db";
import { log } from "../lib/log";

/**
 * Raw items are working material for the next few editions' de-duplication.
 * Once an entry is published, edition_slots holds a frozen copy of everything
 * the page renders, and edition_slots.url carries the permanent "never publish
 * this twice" guard - so the item rows behind it are disposable.
 *
 * Items that are the primary of a published cluster are kept regardless, since
 * deleting one would take its cluster with it.
 */
async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? process.env.RETENTION_DAYS ?? 45);
  if (!Number.isFinite(days) || days < 7) {
    throw new Error(`retention of ${days} days is too short; 7 is the minimum`);
  }

  const before = await one<{ size: string }>(
    `select pg_size_pretty(pg_database_size(current_database())) as size`,
  );

  const deleted = await one<{ n: string }>(
    `with doomed as (
       delete from items i
        where i.ingested_at < now() - make_interval(days => $1)
          and i.published_at < now() - make_interval(days => $1)
          and not exists (
            select 1 from clusters c
             join edition_slots s on s.cluster_id = c.id
            where c.primary_item_id = i.id)
       returning 1)
     select count(*)::text as n from doomed`,
    [days],
  );

  await pool.query(`vacuum analyze items`);

  const after = await one<{ size: string; items: string }>(
    `select pg_size_pretty(pg_database_size(current_database())) as size,
            (select count(*)::text from items) as items`,
  );

  log.info(
    `pruned ${deleted?.n ?? 0} items older than ${days}d · ` +
      `${before?.size} → ${after?.size} · ${after?.items} items remain`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
