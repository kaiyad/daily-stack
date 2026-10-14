import Link from "next/link";
import { unitLabel } from "../lib/units";
import type { RevisionRow } from "../lib/editions";

/**
 * Active recall, not a reading list: the question is visible and the answer is
 * one click away. Server-rendered `<details>`, so it works with no JavaScript.
 */
export function RevisionBlock({ revisions }: { revisions: RevisionRow[] }) {
  if (!revisions.length) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h3>Revision</h3>
        <span className="count">{revisions.length} from earlier editions</span>
      </div>
      <p className="section-blurb">Answer each one before you open it.</p>

      {revisions.map((r) => (
        <details className="recall" key={r.slug}>
          <summary>
            <span className="recall-q">{r.question}</span>
            <span className="recall-age">{r.elapsed_days}d ago</span>
          </summary>
          <p className="recall-a">{r.answer}</p>
          <Link href={`/concepts/${r.slug}`} className="recall-link">
            {unitLabel(r.kind)} · {r.title}
          </Link>
        </details>
      ))}
    </section>
  );
}
