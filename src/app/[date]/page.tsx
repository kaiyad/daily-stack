import { notFound } from "next/navigation";
import { adjacentEditions, frozenDates, getEdition } from "../../lib/editions";
import { isValidYmd } from "../../lib/dates";
import { Masthead } from "../../components/Masthead";
import { ConceptCard } from "../../components/ConceptCard";
import { EditionBody } from "../../components/EditionBody";
import { RevisionBlock } from "../../components/RevisionBlock";
import { Footer } from "../../components/Footer";

export const revalidate = 300;

/**
 * Every past edition is immutable, so every past page is fully static. Only
 * today's can change, and that is what `revalidate` covers.
 */
export async function generateStaticParams() {
  const dates = await frozenDates();
  return dates.map((date) => ({ date }));
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const title = `The Daily Stack · ${date}`;
  // The dated URL is the one worth sharing, so it names itself rather than
  // inheriting the site-wide card from the layout.
  return {
    title,
    alternates: { canonical: `/${date}` },
    openGraph: { title, url: `/${date}` },
    twitter: { title },
  };
}

export default async function EditionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidYmd(date)) notFound();

  const edition = await getEdition(date);
  if (!edition) notFound();

  const { prev, next } = await adjacentEditions(date);

  return (
    <main className="wrap">
      <Masthead
        date={edition.date}
        status={edition.status}
        entryCount={edition.entryCount}
        prev={prev}
        next={next}
      />
      {edition.concept ? <ConceptCard concept={edition.concept} /> : null}
      <EditionBody edition={edition} />
      <RevisionBlock revisions={edition.revisions} />
      <Footer />
    </main>
  );
}
