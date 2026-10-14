import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { DIR, hasPiece, pathFor, readPiece, writtenSlugs } from "./prewritten";
import { Piece } from "./piece";
import type { BookRow } from "../../lib/shelf";

const book = (slug: string): BookRow => ({
  id: 1,
  slug,
  title: "A Title",
  author: "An Author",
  year: 2001,
  genre: "history",
  pitch: "the angle",
  scheduled_date: null,
});

test("a slug with no file does not claim to have a piece", () => {
  assert.equal(hasPiece("a-book-nobody-wrote-about"), false);
});

test("the piece path is the slug under the seed directory", () => {
  assert.equal(pathFor("sapiens"), `${DIR}/sapiens.json`);
});

test("every committed piece parses, and is reported", async () => {
  const slugs = writtenSlugs();
  for (const slug of slugs) {
    assert.ok(hasPiece(slug), `${slug} is listed but has no file`);
    const written = await readPiece(book(slug));
    // A hand-written piece vouches for its own links, so the url map is empty.
    assert.equal(written.urls.size, 0);
    assert.equal(written.model, "written");
    assert.ok(written.piece.sections.length > 0);
  }
});

test("a file that does not match the schema is refused by name", async () => {
  const file = pathFor("__schema-test__");
  fs.writeFileSync(file, JSON.stringify({ headline: "only a headline" }));
  try {
    await assert.rejects(readPiece(book("__schema-test__")), /does not match the piece schema/);
  } finally {
    fs.unlinkSync(file);
  }
});

test("the example piece in the repo is a valid piece", () => {
  const example = `${DIR}/EXAMPLE.json.txt`;
  if (!fs.existsSync(example)) return;
  assert.equal(Piece.safeParse(JSON.parse(fs.readFileSync(example, "utf8"))).success, true);
});
