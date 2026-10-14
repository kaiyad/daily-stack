import { addDays } from "./dates";

/**
 * A unit comes back three days later, ten days later and a month later. The
 * archive is immutable, so a revision is a frozen copy in `edition_revisions`,
 * not a view computed at read time.
 */
export const REVISION_INTERVALS = [3, 10, 30] as const;

/** At most this many recalls in one edition, so the page stays a page. */
export const MAX_REVISIONS = 3;

export type PublishedUnit = {
  conceptId: number;
  slug: string;
  title: string;
  kind: string;
  question: string;
  answer: string;
  originDate: string;
};

export type DueRevision = PublishedUnit & { intervalDays: number; elapsedDays: number };

/**
 * Postgres `undefined_table`. The web app and the schema deploy separately -
 * Vercel builds on push, migrations run in the daily job - so new code can
 * briefly meet the old schema, and a page must survive that.
 */
export function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "42P01";
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Due on the first edition at or after `origin + interval`. Resolving against
 * the editions that actually exist - rather than the calendar - means a missed
 * day postpones a recall instead of silently swallowing it.
 *
 * `pastEditionDates` are the dates already published, ascending, all earlier
 * than the edition being built.
 */
export function dueRevisions(
  editionDate: string,
  pastEditionDates: string[],
  units: PublishedUnit[],
  max: number = MAX_REVISIONS,
): DueRevision[] {
  const best = new Map<number, DueRevision>();

  for (const unit of units) {
    for (const interval of REVISION_INTERVALS) {
      const target = addDays(unit.originDate, interval);
      if (target > editionDate) continue;
      // An earlier edition already carried this one at this interval.
      if (pastEditionDates.some((d) => d >= target && d < editionDate)) continue;

      const current = best.get(unit.conceptId);
      if (current && current.intervalDays >= interval) continue;
      best.set(unit.conceptId, {
        ...unit,
        intervalDays: interval,
        elapsedDays: daysBetween(unit.originDate, editionDate),
      });
    }
  }

  // Shortest interval first: a three-day recall is the one still at risk.
  return [...best.values()]
    .sort((a, b) => a.intervalDays - b.intervalDays || a.originDate.localeCompare(b.originDate))
    .slice(0, max);
}
