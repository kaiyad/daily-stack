import Link from "next/link";
import { Prose } from "./Prose";
import { unitLabel } from "../lib/units";
import type { ConceptRow } from "../pipeline/concepts";

export function ConceptCard({ concept, linkTitle = true }: { concept: ConceptRow; linkTitle?: boolean }) {
  return (
    <article className="concept">
      <div className="concept-kicker">
        {unitLabel(concept.kind)} of the day · {concept.category}
      </div>
      <h2>
        {linkTitle ? <Link href={`/concepts/${concept.slug}`}>{concept.title}</Link> : concept.title}
      </h2>
      <p className="concept-one-liner">{concept.one_liner}</p>
      <Prose markdown={concept.body_md} />

      {concept.practice ? (
        <div className="practice">
          <div className="practice-head">Practice</div>
          <p className="practice-prompt">{concept.practice.prompt}</p>
          {concept.practice.hint ? (
            <details className="practice-hint">
              <summary>Hint</summary>
              <p>{concept.practice.hint}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {concept.links?.length ? (
        <div className="links">
          {concept.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.title}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}
