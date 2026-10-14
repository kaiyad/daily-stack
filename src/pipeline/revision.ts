import { query } from "../lib/db";
import { dueRevisions, type DueRevision, type PublishedUnit } from "../lib/revision";

export type { DueRevision, PublishedUnit };

/** Units published in an edition before `editionDate` that carry a question. */
export async function loadPublishedUnits(editionDate: string): Promise<PublishedUnit[]> {
  const rows = await query<{
    concept_id: number;
    slug: string;
    title: string;
    kind: string;
    question: string;
    answer: string;
    origin_date: string;
  }>(
    `select c.id as concept_id, c.slug, c.title, c.kind,
            c.recall_q as question, c.one_liner as answer,
            to_char(c.scheduled_date, 'YYYY-MM-DD') as origin_date
       from concepts c
       join editions e on e.edition_date = c.scheduled_date and e.entry_count > 0
      where c.recall_q is not null and c.scheduled_date < $1
      order by c.scheduled_date`,
    [editionDate],
  );

  return rows.map((r) => ({
    conceptId: r.concept_id,
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    question: r.question,
    answer: r.answer,
    originDate: r.origin_date,
  }));
}

/** Published edition dates before `editionDate`, ascending. */
export async function pastEditionDates(editionDate: string): Promise<string[]> {
  const rows = await query<{ d: string }>(
    `select to_char(edition_date, 'YYYY-MM-DD') as d
       from editions where edition_date < $1 and entry_count > 0
      order by edition_date`,
    [editionDate],
  );
  return rows.map((r) => r.d);
}

export async function planRevisions(editionDate: string): Promise<DueRevision[]> {
  const [units, past] = await Promise.all([
    loadPublishedUnits(editionDate),
    pastEditionDates(editionDate),
  ]);
  return dueRevisions(editionDate, past, units);
}
