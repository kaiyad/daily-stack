/**
 * Concept bodies are a fixed, hand-written subset of Markdown - paragraphs,
 * `code`, **bold** and ## headings. A full Markdown dependency would be three
 * times the size of this file for no gain.
 */
export function Prose({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return (
    <div className="prose">
      {blocks.map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i}>{inline(block.slice(3))}</h2>
        ) : (
          <p key={i}>{inline(block)}</p>
        ),
      )}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Bold before italic, so `**x**` is never read as two empty emphases.
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={m.index}>{token.slice(1, -1)}</em>);
    } else {
      out.push(<code key={m.index}>{token.slice(1, -1)}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
