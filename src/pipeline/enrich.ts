import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../lib/env";
import { log } from "../lib/log";
import { mapLimit } from "../lib/http";
import type { Selection } from "./select";

const Entry = z.object({
  index: z.number().int().describe("The index of the item being described"),
  summary: z.string().describe("Two sentences at most: what this is, and what is notable"),
  why: z.string().describe("One short clause on why a working developer should care"),
  tags: z.array(z.string()).describe("Two to four lowercase topic tags"),
});

const Batch = z.object({ entries: z.array(Entry) });

export type Enrichment = { summary: string; why: string; tags: string[] };

const SYSTEM = `You write the daily edition of a software news digest for working engineers.

For each item, write:
- summary: at most two sentences. Say what the thing IS and what is notable about it. Plain, factual, specific. No hype words ("game-changing", "revolutionary"), no "this article discusses", no restating the title.
- why: one short clause (under 15 words) on why a working developer should care. No full sentence, no leading "Because".
- tags: two to four lowercase topic tags, e.g. "rust", "postgres", "distributed systems", "build tooling".

Hard rule: use only what the provided title, URL, domain and description support. You are not browsing. If the input is thin, describe only what it actually states - never invent a feature, a number, a version or a claim.`;

const CHUNK = 6;

function describe(sel: Selection, index: number): string {
  const c = sel.entry.cluster;
  const stats = [
    c.points ? `${c.points} points` : null,
    c.comments ? `${c.comments} comments` : null,
    c.starsDelta ? `+${c.starsDelta} stars today` : null,
    c.starsTotal ? `${c.starsTotal} stars total` : null,
    c.mentionCount > 1 ? `covered by ${c.mentionCount} sources` : null,
  ].filter(Boolean).join(", ");

  return [
    `### Item ${index}`,
    `section: ${sel.slot}`,
    `title: ${c.title}`,
    `url: ${c.url}`,
    `domain: ${c.domain}`,
    `source: ${c.primary.source_name}`,
    stats ? `signals: ${stats}` : null,
    c.tags.length ? `feed tags: ${c.tags.join(", ")}` : null,
    c.summaryRaw ? `description: ${c.summaryRaw.slice(0, 700)}` : null,
  ].filter(Boolean).join("\n");
}

/**
 * Runs only over the entries that made the cut - never over the full candidate
 * pool. That is what keeps an edition's enrichment cost in fractions of a cent.
 */
export async function enrich(selections: Selection[]): Promise<Map<number, Enrichment>> {
  const out = new Map<number, Enrichment>();
  if (!env.anthropicKey) {
    log.warn("ANTHROPIC_API_KEY not set - building edition without summaries");
    return out;
  }

  const client = new Anthropic({ apiKey: env.anthropicKey });
  const chunks: { offset: number; slice: Selection[] }[] = [];
  for (let i = 0; i < selections.length; i += CHUNK) {
    chunks.push({ offset: i, slice: selections.slice(i, i + CHUNK) });
  }

  await mapLimit(chunks, 3, async ({ offset, slice }) => {
    const body = slice.map((s, i) => describe(s, offset + i)).join("\n\n");
    try {
      const res = await client.messages.parse({
        model: env.enrichModel,
        max_tokens: 4096,
        system: SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(Batch) },
        messages: [
          {
            role: "user",
            content: `Write an entry for each of the ${slice.length} items below. Return one object per item, keyed by its index.\n\n${body}`,
          },
        ],
      });

      for (const e of res.parsed_output?.entries ?? []) {
        if (e.index < offset || e.index >= offset + slice.length) continue;
        out.set(e.index, {
          summary: e.summary.trim().slice(0, 600),
          why: e.why.trim().replace(/^because\s+/i, "").slice(0, 200),
          tags: e.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 4),
        });
      }
    } catch (err) {
      // A failed chunk costs that chunk its summaries, not the edition.
      log.warn(`enrich chunk at ${offset} failed: ${err instanceof Error ? err.message : err}`);
    }
  });

  log.info(`enriched ${out.size}/${selections.length} entries`);
  return out;
}
