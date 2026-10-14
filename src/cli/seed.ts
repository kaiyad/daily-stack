import fs from "node:fs";
import { pool } from "../lib/db";
import { log } from "../lib/log";

type SeedSource = {
  slug: string;
  name: string;
  kind: string;
  feed_url?: string | null;
  homepage?: string | null;
  trust_weight?: number;
  slot_hint?: string | null;
  tags?: string[];
  enabled?: boolean;
};

type SeedConcept = {
  slug: string;
  title: string;
  kind?: string;
  category: string;
  one_liner: string;
  body_md: string;
  links: { title: string; url: string }[];
  tags?: string[];
  difficulty?: string;
  recall_q?: string;
  practice?: { prompt: string; hint?: string; link?: { title: string; url: string } } | null;
};

async function main(): Promise<void> {
  const sources: SeedSource[] = JSON.parse(fs.readFileSync("db/seed/sources.json", "utf8"));
  const concepts: SeedConcept[] = JSON.parse(fs.readFileSync("db/seed/concepts.json", "utf8"));

  for (const s of sources) {
    await pool.query(
      `insert into sources (slug, name, kind, feed_url, homepage, trust_weight, slot_hint, tags, enabled)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (slug) do update set
         name = excluded.name, kind = excluded.kind, feed_url = excluded.feed_url,
         homepage = excluded.homepage, trust_weight = excluded.trust_weight,
         slot_hint = excluded.slot_hint, tags = excluded.tags`,
      [
        s.slug, s.name, s.kind, s.feed_url ?? null, s.homepage ?? null,
        s.trust_weight ?? 1.0, s.slot_hint ?? null, s.tags ?? [], s.enabled ?? true,
      ],
    );
  }
  log.info(`${sources.length} sources seeded`);

  for (const c of concepts) {
    await pool.query(
      `insert into concepts
         (slug, title, kind, category, one_liner, body_md, links, tags, difficulty, recall_q, practice)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (slug) do update set
         title = excluded.title, kind = excluded.kind, category = excluded.category,
         one_liner = excluded.one_liner, body_md = excluded.body_md, links = excluded.links,
         tags = excluded.tags, difficulty = excluded.difficulty,
         recall_q = excluded.recall_q, practice = excluded.practice`,
      [
        c.slug, c.title, c.kind ?? "concept", c.category, c.one_liner, c.body_md,
        JSON.stringify(c.links), c.tags ?? [], c.difficulty ?? null,
        c.recall_q ?? null, c.practice ? JSON.stringify(c.practice) : null,
      ],
    );
  }
  log.info(`${concepts.length} concepts seeded`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
