import Link from "next/link";
import { listEditions } from "../../lib/editions";
import { Masthead } from "../../components/Masthead";

export const revalidate = 300;

export const metadata = { title: "The Daily Stack · Archive" };

export default async function Archive() {
  const editions = await listEditions();

  return (
    <main className="wrap">
      <Masthead />
      <div className="section-head">
        <h3>Archive</h3>
        <span className="count">{editions.length} editions</span>
      </div>
      <p className="section-blurb">Every edition ever cut, newest first.</p>

      {editions.length === 0 ? (
        <div className="empty">
          <p>Nothing archived yet.</p>
        </div>
      ) : (
        editions.map((e) => (
          <Link href={`/${e.edition_date}`} className="archive-row" key={e.edition_date}>
            <div className="archive-date">{e.edition_date}</div>
            <div className="archive-sub">
              {e.concept_title ? <strong>{e.concept_title}</strong> : null}
              {e.concept_title && e.top_title ? " · " : null}
              {e.top_title}
            </div>
            <div className="archive-count">
              {e.entry_count} entries · {e.status === "frozen" ? "final" : "draft"}
            </div>
          </Link>
        ))
      )}
    </main>
  );
}
