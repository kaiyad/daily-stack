import { env } from "./env";

/** YYYY-MM-DD for an instant, in a given IANA zone. */
export function ymdInTz(at: Date, tz: string = env.editionTz): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function hourInTz(at: Date, tz: string = env.editionTz): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(at),
  );
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The edition a reader should see right now. Before the freeze hour, that is
 * still yesterday's edition - today's has not been cut yet.
 */
export function currentEditionDate(at: Date = new Date()): string {
  const today = ymdInTz(at);
  return hourInTz(at, env.editionTz) >= env.freezeHour ? today : addDays(today, -1);
}

export function formatEditionDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Offset of a zone, in ms, at a given instant. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const p: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - at.getTime();
}

/** The UTC instant of a wall-clock hour on a date in a zone. */
export function zonedToUtc(ymd: string, hour: number, tz: string = env.editionTz): Date {
  const naive = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:00:00Z`);
  // Two passes so the result is right across a DST transition.
  let t = naive - tzOffsetMs(new Date(naive), tz);
  t = naive - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

/** The ingest window an edition is cut from: 36h ending at the freeze hour. */
export function editionWindow(ymd: string): { startAt: Date; endAt: Date } {
  const endAt = zonedToUtc(ymd, env.freezeHour);
  return { startAt: new Date(endAt.getTime() - 36 * 3600_000), endAt };
}
