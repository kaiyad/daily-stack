import { query, one } from "./db";
import { SLOTS, type SlotId } from "./slots";
import type { ConceptRow } from "../pipeline/concepts";

export type EntryRow = {
  slot: SlotId;
  rank: number;
  cluster_id: string;
  title: string;
  url: string;
  domain: string;
  source_label: string;
  summary: string | null;
  why: string | null;
  tags: string[];
  mention_count: number;
  discussion_url: string | null;
  points: number | null;
  comments: number | null;
  published_at: string | null;
};

export type RevisionRow = {
  slug: string;
  title: string;
  kind: string;
  question: string;
  answer: string;
  interval_days: number;
  origin_date: string;
  elapsed_days: number;
};

export type EditionRow = {
  edition_date: string;
  status: "draft" | "frozen";
  entry_count: number;
  built_at: string;
  frozen_at: string | null;
};

export type Edition = {
  date: string;
  status: "draft" | "frozen";
  sections: { slot: SlotId; label: string; blurb: string; entries: EntryRow[] }[];
  concept?: ConceptRow;
  revisions: RevisionRow[];
  entryCount: number;
};

const DATE = `to_char(edition_date, 'YYYY-MM-DD') as edition_date`;

export async function getEdition(date: string): Promise<Edition | undefined> {
  const ed = await one<EditionRow>(
    `select ${DATE}, status, entry_count, built_at, frozen_at
       from editions where edition_date = $1`,
    [date],
  );
  if (!ed) return undefined;

  const entries = await query<EntryRow>(
    `select slot, rank, cluster_id, title, url, domain, source_label, summary, why,
            tags, mention_count, discussion_url, points, comments, published_at
       from edition_slots where edition_date = $1 order by rank`,
    [date],
  );

  const concept = await one<ConceptRow>(
    `select c.* from concepts c
       join editions e on e.concept_id = c.id
      where e.edition_date = $1`,
    [date],
  );

  const revisions = await query<RevisionRow>(
    `select slug, title, kind, question, answer, interval_days,
            to_char(origin_date, 'YYYY-MM-DD') as origin_date,
            (edition_date - origin_date) as elapsed_days
       from edition_revisions where edition_date = $1
      order by interval_days, origin_date`,
    [date],
  );

  const sections = SLOTS.map((s) => ({
    slot: s.id,
    label: s.label,
    blurb: s.blurb,
    entries: entries.filter((e) => e.slot === s.id).sort((a, b) => a.rank - b.rank),
  })).filter((s) => s.entries.length > 0);

  return {
    date: ed.edition_date,
    status: ed.status,
    sections,
    concept,
    revisions,
    entryCount: ed.entry_count,
  };
}

/** Newest edition that has anything in it. */
export async function latestEditionDate(): Promise<string | undefined> {
  const row = await one<{ edition_date: string }>(
    `select ${DATE} from editions where entry_count > 0 order by edition_date desc limit 1`,
  );
  return row?.edition_date;
}

export async function listEditions(): Promise<
  (EditionRow & { concept_title: string | null; concept_slug: string | null; top_title: string | null })[]
> {
  return await query(
    `select ${DATE}, e.status, e.entry_count, e.built_at, e.frozen_at,
            c.title as concept_title, c.slug as concept_slug,
            (select title from edition_slots s
              where s.edition_date = e.edition_date order by score desc limit 1) as top_title
       from editions e
       left join concepts c on c.id = e.concept_id
      where e.entry_count > 0
      order by e.edition_date desc`,
  );
}

export async function adjacentEditions(
  date: string,
): Promise<{ prev?: string; next?: string }> {
  const [prev, next] = await Promise.all([
    one<{ edition_date: string }>(
      `select ${DATE} from editions
        where edition_date < $1 and entry_count > 0
        order by edition_date desc limit 1`,
      [date],
    ),
    one<{ edition_date: string }>(
      `select ${DATE} from editions
        where edition_date > $1 and entry_count > 0
        order by edition_date asc limit 1`,
      [date],
    ),
  ]);
  return { prev: prev?.edition_date, next: next?.edition_date };
}

export async function frozenDates(): Promise<string[]> {
  const rows = await query<{ edition_date: string }>(
    `select ${DATE} from editions where entry_count > 0 order by edition_date desc limit 400`,
  );
  return rows.map((r) => r.edition_date);
}
