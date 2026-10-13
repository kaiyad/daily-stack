import { buildEdition, closePool } from "../pipeline/build";
import { currentEditionDate, isValidYmd } from "../lib/dates";
import { log } from "../lib/log";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dateArg = args.find((a) => isValidYmd(a));
  const date = dateArg ?? currentEditionDate();

  const result = await buildEdition(date, {
    freeze: args.includes("--freeze"),
    skipEnrich: args.includes("--no-enrich"),
  });

  log.info(
    `${result.editionDate}: ${result.entries} entries from ${result.clusters} stories ` +
      `(${result.candidates} items)${result.concept ? `, concept "${result.concept}"` : ""}` +
      `${result.frozen ? " - FROZEN" : " - draft"}`,
  );
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
