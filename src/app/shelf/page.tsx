import Link from "next/link";
import { Masthead } from "../../components/Masthead";
import { listShelf } from "../../pipeline/shelf";
import { formatEditionDate } from "../../lib/dates";
import { readMinutes, type ShelfRow } from "../../lib/shelf";

export const revalidate = 3600;

export const metadata = {
  title: "The Weekly Shelf · The Daily Stack",
  description: "One famous book a week, read in depth. Published Friday night.",
};

export default async function ShelfIndex() {
  const shelves: ShelfRow[] = await listShelf();

  return (
    <main className="wrap">
      <Masthead />
      <section className="shelf-head">
        <div className="shelf-kicker">The Weekly Shelf</div>
        <h1 className="shelf-title">One book a week, read properly</h1>
        <p className="shelf-dek">
          A long summary of one famous book every Friday night — the argument, the evidence, the
          objections, and where to read further. Science, computing, economics, politics, geography,
          biology, history and the occasional thriller.
        </p>
      </section>

      {shelves.length === 0 ? (
        <p className="empty">No books published yet.</p>
      ) : (
        <div>
          {shelves.map((s) => (
            <Link className="shelf-row" href={`/shelf/${s.slug}`} key={s.slug}>
              <div className="shelf-row-date">
                {formatEditionDate(s.shelf_date)} · {s.genre} · {readMinutes(s.word_count)} min
              </div>
              <div className="shelf-row-title">{s.title}</div>
              <div className="shelf-row-sub">
                {s.author}
                {s.year ? ` · ${s.year}` : ""} — {s.headline}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="datenav">
        <Link href="/">← today&rsquo;s edition</Link>
        <Link href="/archive">archive</Link>
      </div>
    </main>
  );
}
