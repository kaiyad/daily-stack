# Pre-written shelf pieces

One file per book, named `<slug>.json`, where `<slug>` matches a row in
`db/seed/books.json`. A file here is the **primary** way the shelf publishes:
`pickWriter` in `src/pipeline/shelf.ts` prefers it over any model, because it
was written with a human in the loop and its links were checked by hand.

`EXAMPLE.json.txt` is the shape, annotated. It is not loaded (the `.txt`
suffix keeps it out of `writtenSlugs`), but it is schema-checked by the tests.

Link `kind` is one of `concept`, `context`, `review`, `author`,
`primary-source`, `adaptation` — it decides which heading the link appears
under on the page.

A file's links are **not** re-vetted at publish time, unlike a generated
piece's. Whoever writes the file is the check. Run `npm run shelf:status` to see
which scheduled Fridays still have no file and will therefore fall back to a
model.
