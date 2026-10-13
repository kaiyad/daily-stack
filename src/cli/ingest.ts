import { ingestAll } from "../ingest/index";
import { pool } from "../lib/db";
import { log } from "../lib/log";

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const results = await ingestAll(only.length ? only : undefined);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const newItems = results.reduce((n, r) => n + r.inserted, 0);

  log.info(`${ok.length} sources ok, ${failed.length} failed, ${newItems} new items`);
  for (const f of failed) log.warn(`  ${f.source}: ${f.error}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
