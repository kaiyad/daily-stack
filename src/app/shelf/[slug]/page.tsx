import Link from "next/link";
import { notFound } from "next/navigation";
import { Masthead } from "../../../components/Masthead";
import { ShelfBody } from "../../../components/ShelfBody";
import { getShelf, listShelf } from "../../../pipeline/shelf";

export const revalidate = 3600;

export async function generateStaticParams() {
  const shelves = await listShelf();
  return shelves.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shelf = await getShelf(slug);
  if (!shelf) return { title: "Not found" };
  return {
    title: `${shelf.title} · The Weekly Shelf`,
    description: shelf.headline,
  };
}

export default async function ShelfPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shelf = await getShelf(slug);
  if (!shelf) notFound();

  return (
    <main className="wrap">
      <Masthead />
      <ShelfBody shelf={shelf} />
      <div className="datenav">
        <Link href="/shelf">← the shelf</Link>
        <Link href={`/${shelf.shelf_date}`}>edition of {shelf.shelf_date}</Link>
      </div>
    </main>
  );
}
