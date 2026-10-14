import { query } from "../../lib/db";
import { Masthead } from "../../components/Masthead";
import { CheatsheetList, type CheatRow } from "../../components/CheatsheetList";

export const revalidate = 300;

export const metadata = {
  title: "The Daily Stack · Cheatsheet",
  description:
    "Every concept, algorithm, data structure and pattern the Daily Stack has published, on one page.",
};

/** A unit is published exactly when its edition is, not when its date arrives. */
export default async function Cheatsheet() {
  const units = await query<CheatRow>(
    `select c.slug, c.title, c.kind, c.category, c.one_liner, c.tags,
            to_char(c.scheduled_date, 'YYYY-MM-DD') as scheduled_date
       from concepts c
       join editions e on e.edition_date = c.scheduled_date and e.entry_count > 0
      order by c.title`,
  );

  const queued = await query<{ n: string }>(
    `select count(*)::text as n from concepts c
      where not exists (
        select 1 from editions e
         where e.edition_date = c.scheduled_date and e.entry_count > 0)`,
  );

  return (
    <main className="wrap">
      <Masthead />
      <div className="section-head">
        <h3>Cheatsheet</h3>
        <span className="count">
          {units.length} published · {queued[0].n} queued
        </span>
      </div>
      <p className="section-blurb">
        One unit a day, from a fixed curriculum: concepts, algorithms, data structures and patterns.
        Nothing here is generated per day, so an entry reads the same on edition 400 as on edition 1.
      </p>

      {units.length === 0 ? (
        <div className="empty">
          <p>Nothing published yet - the first edition publishes the first unit.</p>
        </div>
      ) : (
        <CheatsheetList units={units} />
      )}
    </main>
  );
}
