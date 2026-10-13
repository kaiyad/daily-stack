import Link from "next/link";
import { query } from "../../lib/db";
import { Masthead } from "../../components/Masthead";

export const revalidate = 300;

export const metadata = { title: "The Daily Stack · Concepts" };

type Row = {
  slug: string;
  title: string;
  category: string;
  one_liner: string;
  scheduled_date: string | null;
};

export default async function Concepts() {
  const rows = await query<Row>(
    `select c.slug, c.title, c.category, c.one_liner,
            to_char(c.scheduled_date, 'YYYY-MM-DD') as scheduled_date
       from concepts c
       join editions e on e.edition_date = c.scheduled_date and e.entry_count > 0
      order by c.scheduled_date desc`,
  );

  const pending = await query<{ n: string }>(
    `select count(*)::text as n from concepts c
      where not exists (
        select 1 from editions e
         where e.edition_date = c.scheduled_date and e.entry_count > 0)`,
  );

  const byCategory = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  return (
    <main className="wrap">
      <Masthead />
      <div className="section-head">
        <h3>Concepts</h3>
        <span className="count">
          {rows.length} published · {pending[0].n} queued
        </span>
      </div>
      <p className="section-blurb">
        A fixed curriculum, one per edition. Nothing here is generated per day, so an entry reads
        the same on edition 400 as on edition 1.
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <p>No concepts published yet - the first edition publishes the first one.</p>
        </div>
      ) : (
        [...byCategory.entries()].map(([category, list]) => (
          <section className="section" key={category}>
            <div className="section-head">
              <h3>{category}</h3>
              <span className="count">{list.length}</span>
            </div>
            {list.map((c) => (
              <Link href={`/concepts/${c.slug}`} className="entry" key={c.slug}>
                <p className="entry-title">{c.title}</p>
                <p className="entry-summary">{c.one_liner}</p>
                <div className="entry-foot">
                  <span className="domain">{c.scheduled_date}</span>
                </div>
              </Link>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
