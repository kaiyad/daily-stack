import Link from "next/link";
import { notFound } from "next/navigation";
import { one, query } from "../../../lib/db";
import type { ConceptRow } from "../../../pipeline/concepts";
import { Masthead } from "../../../components/Masthead";
import { ConceptCard } from "../../../components/ConceptCard";

export const revalidate = 3600;

/**
 * A concept is published exactly when its edition is - not on a clock. Gating
 * on the date instead would 404 today's concept for the hours before the
 * freeze, while the edition page above it was already showing it.
 */
const PUBLISHED = `
  select c.*, to_char(c.scheduled_date, 'YYYY-MM-DD') as scheduled_date
    from concepts c
    join editions e on e.edition_date = c.scheduled_date and e.entry_count > 0`;

export async function generateStaticParams() {
  const rows = await query<{ slug: string }>(`${PUBLISHED}`);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = await one<ConceptRow>(`${PUBLISHED} where c.slug = $1`, [slug]);
  return { title: concept ? `${concept.title} · The Daily Stack` : "Not found" };
}

export default async function ConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = await one<ConceptRow>(`${PUBLISHED} where c.slug = $1`, [slug]);
  if (!concept) notFound();

  const date = String(concept.scheduled_date);

  return (
    <main className="wrap">
      <Masthead />
      <ConceptCard concept={concept} linkTitle={false} />
      <div className="datenav">
        <Link href={`/${date}`}>← edition of {date}</Link>
        <Link href="/cheatsheet">cheatsheet</Link>
      </div>
    </main>
  );
}
