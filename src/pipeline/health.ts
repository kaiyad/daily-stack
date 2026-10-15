import { one, query } from "../lib/db";
import { currentEditionDate } from "../lib/dates";
import { env } from "../lib/env";
import { verdicts, type HealthFacts, type HealthReport } from "../lib/health";
import { isMissingTable } from "../lib/revision";

/**
 * One pass over everything that can quietly stop working: the daily job, the
 * feeds behind it, the curriculum runway and the storage cap. The thresholds
 * that turn these numbers into a verdict are in `lib/health.ts`.
 */
export async function health(): Promise<HealthReport> {
  const expected = currentEditionDate();

  const [edition, ingest, sources, runway, storage, shelf] = await Promise.all([
    one<{ edition_date: string; status: string; entry_count: number; behind: number }>(
      `select to_char(edition_date, 'YYYY-MM-DD') as edition_date, status, entry_count,
              ($1::date - edition_date) as behind
         from editions where entry_count > 0 order by edition_date desc limit 1`,
      [expected],
    ),
    one<{ last_run: string | null; hours: number | null }>(
      `select max(finished_at)::text as last_run,
              extract(epoch from (now() - max(finished_at))) / 3600 as hours
         from fetch_runs where ok is not null`,
    ),
    one<{ enabled: number; failing: number; slugs: string[] }>(
      `select count(*)::int as enabled,
              count(*) filter (where last_error is not null)::int as failing,
              coalesce(array_agg(slug) filter (where last_error is not null), '{}') as slugs
         from sources where enabled`,
    ),
    one<{ days: number }>(
      `select count(*)::int as days from concepts where scheduled_date >= $1::date`,
      [expected],
    ),
    one<{ bytes: number; pretty: string }>(
      `select pg_database_size(current_database())::bigint as bytes,
              pg_size_pretty(pg_database_size(current_database())) as pretty`,
    ),
    shelfHorizon(expected),
  ]);

  const bytes = Number(storage?.bytes ?? 0);
  const facts: HealthFacts = {
    expected,
    editionDate: edition?.edition_date ?? null,
    editionStatus: edition?.status ?? null,
    editionEntries: edition?.entry_count ?? 0,
    editionBehindDays: edition ? Number(edition.behind) : null,
    ingestHoursAgo:
      ingest?.hours === null || ingest?.hours === undefined
        ? null
        : Math.round(Number(ingest.hours) * 10) / 10,
    sourcesEnabled: sources?.enabled ?? 0,
    sourcesFailing: sources?.failing ?? 0,
    failingSlugs: sources?.slugs ?? [],
    runwayDays: runway?.days ?? 0,
    booksScheduled: shelf?.scheduled ?? null,
    nextBookDate: shelf?.nextDate ?? null,
    storageBytes: bytes,
    storagePretty: storage?.pretty ?? "0 bytes",
    storagePct: Math.round((bytes / (env.dbCapMb * 1024 * 1024)) * 100),
    storageCapMb: env.dbCapMb,
  };

  const { problems, warnings } = verdicts(facts);
  return { ...facts, ok: problems.length === 0, checkedAt: new Date().toISOString(), problems, warnings };
}

/** Null rather than throwing when migration 0004 has not reached this database. */
async function shelfHorizon(
  from: string,
): Promise<{ nextDate: string | null; scheduled: number } | null> {
  try {
    const rows = await query<{ next_date: string | null; scheduled: number }>(
      `select to_char(min(scheduled_date), 'YYYY-MM-DD') as next_date, count(*)::int as scheduled
         from books where scheduled_date >= $1::date`,
      [from],
    );
    return { nextDate: rows[0]?.next_date ?? null, scheduled: rows[0]?.scheduled ?? 0 };
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return null;
  }
}
