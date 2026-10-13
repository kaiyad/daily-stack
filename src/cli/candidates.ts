import { reportCandidates } from "../pipeline/build";
import { currentEditionDate, isValidYmd } from "../lib/dates";
import { SLOTS } from "../lib/slots";
import { pool } from "../lib/db";

function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const date = arg && isValidYmd(arg) ? arg : currentEditionDate();
  const limit = Number(process.env.LIMIT ?? 60);

  const { scored, offTopic } = await reportCandidates(date);

  console.log(`\nCandidate pool for ${date} - ${scored.length} stories\n`);
  for (const slot of SLOTS) {
    const inSlot = scored.filter((s) => s.slot === slot.id);
    console.log(
      `${slot.label} (${slot.limit} slots, ${inSlot.length} candidates)`,
    );
    for (const s of inSlot.slice(0, limit)) {
      const c = s.cluster;
      console.log(
        `  ${s.score.toFixed(3)}  ${pad(c.domain, 24)} ${pad(c.title, 78)}` +
          `  [p${s.percentile.toFixed(2)} e${Math.round(s.engagement)} m${c.mentionCount}` +
          `${s.penalty ? ` -${s.penalty.toFixed(2)}` : ""}${s.isAi ? " ai" : ""}]`,
      );
    }
    console.log("");
  }
  if (offTopic.length) {
    console.log(`Dropped as off-topic (${offTopic.length}):`);
    for (const c of offTopic.slice(0, 15)) {
      console.log(`  ${pad(c.domain, 24)} ${c.title.slice(0, 80)}`);
    }
    console.log("");
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
