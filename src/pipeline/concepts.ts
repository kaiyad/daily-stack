import { one, query } from "../lib/db";

export type ConceptRow = {
  id: number;
  slug: string;
  title: string;
  category: string;
  one_liner: string;
  body_md: string;
  links: { title: string; url: string }[];
  tags: string[];
  difficulty: string | null;
  scheduled_date: string | null;
};

/**
 * Concepts come from a fixed curriculum, scheduled in order and pinned to a
 * date the first time that date is built. Nothing is generated per day, so the
 * section reads the same on edition 400 as on edition 1.
 */
export async function assignConcept(editionDate: string): Promise<ConceptRow | undefined> {
  const existing = await one<ConceptRow>(
    `select * from concepts where scheduled_date = $1`,
    [editionDate],
  );
  if (existing) return existing;

  const next = await one<ConceptRow>(
    `update concepts set scheduled_date = $1
      where id = (select id from concepts where scheduled_date is null order by id limit 1)
      returning *`,
    [editionDate],
  );
  return next;
}

export async function getConcept(slug: string): Promise<ConceptRow | undefined> {
  return await one<ConceptRow>(`select * from concepts where slug = $1`, [slug]);
}

export async function listConcepts(): Promise<ConceptRow[]> {
  return await query<ConceptRow>(
    `select * from concepts where scheduled_date is not null
      order by scheduled_date desc`,
  );
}
