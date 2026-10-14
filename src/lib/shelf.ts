import { addDays, hourInTz, ymdInTz } from "./dates";
import { env } from "./env";

/** `Date#getUTCDay` for a plain YYYY-MM-DD, read as a civil date. */
function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const FRIDAY = 5;

/** The Friday on or before `ymd`. */
export function fridayOnOrBefore(ymd: string): string {
  return addDays(ymd, -((dayOfWeek(ymd) - FRIDAY + 7) % 7));
}

/** The Friday strictly after `ymd`. */
export function nextFriday(ymd: string): string {
  return addDays(fridayOnOrBefore(ymd), 7);
}

/**
 * The shelf a reader should see right now. Friday before the publish hour is
 * still last week's book: this Friday's has not been written yet. The zone and
 * hour are parameters so this is testable without a fixed environment.
 */
export function currentShelfDate(
  at: Date = new Date(),
  tz: string = env.editionTz,
  publishHour: number = env.shelfPublishHour,
): string {
  const today = ymdInTz(at, tz);
  const friday = fridayOnOrBefore(today);
  if (friday !== today) return friday;
  return hourInTz(at, tz) >= publishHour ? friday : addDays(friday, -7);
}

export function isFriday(ymd: string): boolean {
  return dayOfWeek(ymd) === FRIDAY;
}

export type ShelfLinkKind =
  | "concept"
  | "context"
  | "review"
  | "author"
  | "primary-source"
  | "adaptation";

export type ShelfLink = {
  title: string;
  url: string;
  note: string;
  kind: ShelfLinkKind;
};

export type ShelfSection = { heading: string; body_md: string };

/**
 * How a piece came to exist. `written` is a file committed to the repo, which
 * is the intended path; the other two are the fallbacks that keep a Friday
 * from passing in silence.
 */
export type Provenance = "written" | "claude" | "gemini";

export type BookRow = {
  id: number;
  slug: string;
  title: string;
  author: string;
  year: number | null;
  genre: string;
  pitch: string;
  scheduled_date: string | null;
};

export type ShelfRow = {
  shelf_date: string;
  book_id: number;
  status: "draft" | "frozen";
  provenance: Provenance;
  slug: string;
  title: string;
  author: string;
  year: number | null;
  genre: string;
  headline: string;
  dek: string;
  sections: ShelfSection[];
  takeaways: string[];
  context_links: ShelfLink[];
  sources: ShelfLink[];
  word_count: number;
  searches: number;
  links_dropped: number;
  model: string | null;
  built_at: string;
  frozen_at: string | null;
};

export const LINK_GROUPS: { kind: ShelfLinkKind; label: string }[] = [
  { kind: "concept", label: "Concepts worth following up" },
  { kind: "context", label: "Context" },
  { kind: "primary-source", label: "Primary sources" },
  { kind: "author", label: "The author" },
  { kind: "review", label: "What others made of it" },
  { kind: "adaptation", label: "Adaptations and talks" },
];

/** A reading time the number of words actually supports, at 220wpm. */
export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
