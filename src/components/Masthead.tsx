import Link from "next/link";

export function Masthead({
  date,
  status,
  entryCount,
  prev,
  next,
}: {
  date?: string;
  status?: string;
  entryCount?: number;
  prev?: string;
  next?: string;
}) {
  return (
    <header className="masthead">
      <div className="masthead-top">
        <Link href="/" className="logo">
          the daily <span>stack</span>
        </Link>
        <nav className="nav">
          <Link href="/">Today</Link>
          <Link href="/archive">Archive</Link>
          <Link href="/cheatsheet">Cheatsheet</Link>
        </nav>
      </div>

      {date ? (
        <>
          <div className="edition-line">
            <h1 className="edition-date">{formatLong(date)}</h1>
            <div className="edition-meta">
              {entryCount} entries · {status === "frozen" ? "final" : "draft"}
            </div>
          </div>
          <div className="datenav">
            {prev ? <Link href={`/${prev}`}>← {prev}</Link> : <span>← earlier</span>}
            {next ? <Link href={`/${next}`}>{next} →</Link> : <span>later →</span>}
          </div>
        </>
      ) : null}
    </header>
  );
}

function formatLong(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
