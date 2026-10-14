import { pool, query } from "../lib/db";
import { log } from "../lib/log";
import { addDays, currentEditionDate } from "../lib/dates";
import { ROTATION, UNIT_KIND_IDS, kindForDate, type UnitKind } from "../lib/units";

type Pending = { id: number; slug: string; kind: UnitKind };

/**
 * Pins the next N dates to units, following the weekly rotation, so the
 * curriculum order is visible ahead of time instead of being decided at build.
 * A date whose kind has run dry still gets a unit: an empty slot is worse than
 * an off-rotation one.
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

  const pending = await query<Pending>(
    `select id, slug, kind from concepts where scheduled_date is null order by id`,
  );

  const byKind = new Map<UnitKind, Pending[]>(UNIT_KIND_IDS.map((k) => [k, []]));
  for (const p of pending) byKind.get(p.kind)?.push(p);

  const deepest = (): UnitKind | undefined =>
    [...byKind.entries()]
      .filter(([, list]) => list.length)
      .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

  let cursor = start;
  let assigned = 0;

  for (let i = 0; i < days; i++) {
    while (taken.has(cursor)) cursor = addDays(cursor, 1);

    const wanted = kindForDate(cursor);
    const kind = byKind.get(wanted)?.length ? wanted : deepest();
    if (!kind) break;

    const unit = byKind.get(kind)!.shift()!;
    await query(`update concepts set scheduled_date = $2 where id = $1`, [unit.id, cursor]);
    log.info(`${cursor}  ${kind === wanted ? " " : "*"} ${kind.padEnd(14)} ${unit.slug}`);
    taken.add(cursor);
    assigned++;
  }

  log.info(`${assigned} scheduled`);
  reportRunway(byKind);
  await pool.end();
}

/** Days of rotation left per kind, so the curriculum is refilled before it runs out. */
function reportRunway(byKind: Map<UnitKind, Pending[]>): void {
  for (const kind of UNIT_KIND_IDS) {
    const left = byKind.get(kind)?.length ?? 0;
    const perWeek = ROTATION.filter((k) => k === kind).length;
    const weeks = perWeek ? left / perWeek : 0;
    log.info(
      `${kind.padEnd(14)} ${String(left).padStart(3)} unscheduled  ` +
        `${perWeek}/week  ~${Math.floor(weeks * 7)} days of rotation left`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
