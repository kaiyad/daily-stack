/**
 * What "still working" means, as pure logic. A frozen daily cannot show a
 * reader that it has died: the last edition is immutable, so it looks exactly
 * as final on the day the job breaks as it did the day it was cut. These are
 * the thresholds that say so instead.
 *
 * The queries behind them are in `pipeline/health.ts`.
 */

/** Wider than the 36h ingest window means an edition was cut from stale material. */
const STALE_INGEST_HOURS = 36;
/** Below this, the mix is thin enough that slots start going unfilled. */
const FAILING_SOURCE_SHARE = 0.25;
const RUNWAY_WARN_DAYS = 14;
const STORAGE_WARN_PCT = 70;
const STORAGE_FAIL_PCT = 90;

export type HealthFacts = {
  /** The edition a reader should be seeing right now. */
  expected: string;
  editionDate: string | null;
  editionStatus: string | null;
  editionEntries: number;
  /** Days between the newest edition and the expected one; null if there is none. */
  editionBehindDays: number | null;
  ingestHoursAgo: number | null;
  sourcesEnabled: number;
  sourcesFailing: number;
  failingSlugs: string[];
  runwayDays: number;
  /** Null when migration 0004 has not reached this database. */
  booksScheduled: number | null;
  nextBookDate: string | null;
  storageBytes: number;
  storagePretty: string;
  storagePct: number;
  storageCapMb: number;
};

export type HealthReport = HealthFacts & {
  ok: boolean;
  checkedAt: string;
  /** Things that mean the site is already wrong for a reader. */
  problems: string[];
  /** Things that will become problems if left alone. */
  warnings: string[];
};

export function verdicts(f: HealthFacts): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (f.editionBehindDays === null) problems.push("no edition has ever been cut");
  else if (f.editionBehindDays > 1) {
    problems.push(`the newest edition is ${f.editionBehindDays} days behind ${f.expected}`);
  }

  if (f.ingestHoursAgo === null) problems.push("no ingest has ever run");
  else if (f.ingestHoursAgo > STALE_INGEST_HOURS) {
    problems.push(`the last ingest finished ${Math.round(f.ingestHoursAgo)}h ago`);
  }

  if (f.sourcesFailing > f.sourcesEnabled * FAILING_SOURCE_SHARE) {
    problems.push(`${f.sourcesFailing} of ${f.sourcesEnabled} enabled sources are failing`);
  } else if (f.sourcesFailing > 0) {
    warnings.push(`${f.sourcesFailing} source(s) failing: ${f.failingSlugs.slice(0, 6).join(", ")}`);
  }

  if (f.runwayDays === 0) {
    problems.push("no units are scheduled - every edition from now has an empty slot");
  } else if (f.runwayDays < RUNWAY_WARN_DAYS) {
    warnings.push(`only ${f.runwayDays} days of units scheduled - run \`npm run concepts:schedule\``);
  }

  if (f.storagePct >= STORAGE_FAIL_PCT) {
    problems.push(`storage at ${f.storagePct}% of the ${f.storageCapMb}MB cap`);
  } else if (f.storagePct >= STORAGE_WARN_PCT) {
    warnings.push(`storage at ${f.storagePct}% of the ${f.storageCapMb}MB cap - lower RETENTION_DAYS`);
  }

  if (f.booksScheduled === 0) warnings.push("no books are scheduled - run `npm run shelf:schedule`");

  return { problems, warnings };
}
