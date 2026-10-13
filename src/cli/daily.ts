import { ingestAll } from "../ingest/index";
import { buildEdition, closePool } from "../pipeline/build";
import { currentEditionDate } from "../lib/dates";
import { log } from "../lib/log";

/** The whole daily job: fetch everything, cut the edition, freeze it. */
async function main(): Promise<void> {
  const results = await ingestAll();
  const failed = results.filter((r) => !r.ok);
  if (failed.length) log.warn(`${failed.length} source(s) failed: ${failed.map((f) => f.source).join(", ")}`);

  const date = currentEditionDate();
  const built = await buildEdition(date, { freeze: true });
  log.info(`edition ${built.editionDate} frozen with ${built.entries} entries`);
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
