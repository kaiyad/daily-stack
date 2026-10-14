import { pool } from "../lib/db";
import { log } from "../lib/log";
import { buildShelf } from "../pipeline/shelf";
import { currentShelfDate, isFriday } from "../lib/shelf";
import { isValidYmd } from "../lib/dates";

/** The weekly job: write this week's piece and, with --freeze, publish it. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const freeze = args.includes("--freeze");
  const at = args.indexOf("--date");
  const date = at === -1 ? currentShelfDate() : args[at + 1];

  if (!date || !isValidYmd(date)) throw new Error(`--date wants YYYY-MM-DD, got ${date}`);
  if (!isFriday(date)) log.warn(`${date} is not a Friday`);

  const built = await buildShelf(date, { freeze });
  if (!built) {
    log.warn("nothing built");
    await pool.end();
    process.exit(1);
  }

  log.info(`shelf ${built.shelfDate} ${built.status}: ${built.slug}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
