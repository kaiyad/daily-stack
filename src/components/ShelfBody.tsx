import { Prose } from "./Prose";
import { LINK_GROUPS, readMinutes, type Provenance, type ShelfRow } from "../lib/shelf";

const MADE_BY: Record<Provenance, string> = {
  written: "written ahead of publication",
  claude: "drafted by Claude from searched sources",
  gemini: "drafted by Gemini from searched sources",
};

/**
 * The piece itself. Sections carry their own headings, so `Prose` is handed
 * one section's body at a time rather than one long document.
 */
export function ShelfBody({ shelf }: { shelf: ShelfRow }) {
  return (
    <article className="shelf">
      <header className="shelf-head">
        <div className="shelf-kicker">
          {shelf.genre} · {readMinutes(shelf.word_count)} min read
        </div>
        <h1 className="shelf-title">{shelf.title}</h1>
        <div className="shelf-byline">
          {shelf.author}
          {shelf.year ? ` · ${shelf.year}` : ""}
        </div>
        <p className="shelf-headline">{shelf.headline}</p>
        <p className="shelf-dek">{shelf.dek}</p>
      </header>

      {shelf.sections.map((section, i) => (
        <section className="shelf-section" key={i}>
          <h2>{section.heading}</h2>
          <Prose markdown={section.body_md} />
        </section>
      ))}

      {shelf.takeaways.length > 0 && (
        <section className="shelf-takeaways">
          <h2>What to keep</h2>
          <ul>
            {shelf.takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {LINK_GROUPS.map(({ kind, label }) => {
        const links = shelf.context_links.filter((l) => l.kind === kind);
        if (!links.length) return null;
        return (
          <section className="shelf-links" key={kind}>
            <h2>{label}</h2>
            <ul>
              {links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} rel="noreferrer">
                    {l.title}
                  </a>
                  {l.note ? <span className="shelf-link-note"> — {l.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {shelf.sources.length > 0 && (
        <section className="shelf-links">
          <h2>Sources</h2>
          <ul>
            {shelf.sources.map((l) => (
              <li key={l.url}>
                <a href={l.url} rel="noreferrer">
                  {l.title}
                </a>
                {l.note ? <span className="shelf-link-note"> — {l.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="shelf-provenance">
        {MADE_BY[shelf.provenance]}
        {shelf.searches ? `, over ${shelf.searches} searches` : ""}. Every link on this page
        resolved when the piece was published.
      </p>
    </article>
  );
}
