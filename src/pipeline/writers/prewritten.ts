import fs from "node:fs";
import path from "node:path";
import type { BookRow } from "../../lib/shelf";
import { Piece, type Written } from "./piece";

export const DIR = "db/seed/shelf";

export function pathFor(slug: string): string {
  return path.join(DIR, `${slug}.json`);
}

export function hasPiece(slug: string): boolean {
  return fs.existsSync(pathFor(slug));
}

/** Every slug with a piece committed, whether or not it is scheduled. */
export function writtenSlugs(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

/**
 * A piece written ahead of time and committed to the repo - the primary way
 * the shelf publishes. It goes through the same schema as a generated one, so
 * a file that is missing a section or a link kind fails here rather than
 * rendering wrong, and its links are not re-vetted: whoever wrote the file
 * checked them, which is the point of writing it by hand.
 */
export async function readPiece(book: BookRow): Promise<Written> {
  const file = pathFor(book.slug);
  const parsed = Piece.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));

  if (!parsed.success) {
    const where = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`${file} does not match the piece schema - ${where}`);
  }

  return { piece: parsed.data, urls: new Map(), searches: 0, model: "written" };
}
