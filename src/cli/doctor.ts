import { pool } from "../lib/db";
import { log } from "../lib/log";
import { health } from "../pipeline/health";

/**
 * The same report as `/api/health`, for a terminal and for CI. It exits
 * non-zero on a problem, so the daily workflow can run it as a final step and
 * turn a silent degradation - dead feeds, an empty curriculum, a full disk -
 * into a failed run that actually emails someone.
 */
async function main(): Promise<void> {
  const report = await health();

  log.info(
    `edition   ${report.editionDate ?? "none"} (${report.editionStatus ?? "-"}, ` +
      `${report.editionEntries} entries, expected ${report.expected})`,
  );
  log.info(
    `ingest    ${report.ingestHoursAgo === null ? "never" : `${report.ingestHoursAgo}h ago`} · ` +
      `${report.sourcesEnabled - report.sourcesFailing}/${report.sourcesEnabled} sources ok`,
  );
  log.info(`units     ${report.runwayDays} days scheduled`);
  log.info(
    `shelf     ${
      report.booksScheduled === null
        ? "not migrated"
        : `${report.booksScheduled} books scheduled, next ${report.nextBookDate ?? "none"}`
    }`,
  );
  log.info(`storage   ${report.storagePretty} · ${report.storagePct}% of ${report.storageCapMb}MB`);

  for (const w of report.warnings) log.warn(w);
  for (const p of report.problems) log.error(p);

  await pool.end();
  if (!report.ok) process.exit(1);
  log.info("ok");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
