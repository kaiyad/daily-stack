import { query, one } from "../lib/db";
import { log } from "../lib/log";
import { canonicalizeUrl, urlHash } from "../lib/url";
import { mapLimit } from "../lib/http";
import type { Fetcher, RawItem, SourceRow } from "./types";
import { fetchHn } from "./sources/hn";
import { fetchRss } from "./sources/rss";
import { fetchGithub } from "./sources/github";
import { fetchLobsters } from "./sources/lobsters";
import { fetchArxiv } from "./sources/arxiv";
import { fetchReddit } from "./sources/reddit";

const FETCHERS: Record<SourceRow["kind"], Fetcher> = {
  hn: fetchHn,
  rss: fetchRss,
  github: fetchGithub,
  lobsters: fetchLobsters,
  arxiv: fetchArxiv,
  reddit: fetchReddit,
};

/** Feeds routinely carry years of history; anything this old is not news. */
const MAX_AGE_DAYS = 14;

export type IngestResult = {
  source: string;
  ok: boolean;
  seen: number;
  inserted: number;
  error?: string;
};

async function writeItem(src: SourceRow, item: RawItem): Promise<boolean> {
  const canonical = canonicalizeUrl(item.url);
  const hash = urlHash(canonical);

  const now = Date.now();
  let published = item.publishedAt?.getTime?.() ?? now;
  if (!Number.isFinite(published)) published = now;
  // Feeds lie about the future; trust the clock instead.
  if (published > now + 86_400_000) published = now;
  if (now - published > MAX_AGE_DAYS * 86_400_000) return false;

  const row = await one<{ id: string; inserted: boolean }>(
    `insert into items
       (source_id, external_id, url_canonical, url_hash, title, author,
        summary_raw, discussion_url, published_at, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (source_id, url_hash) do update set
       title = excluded.title,
       summary_raw = coalesce(excluded.summary_raw, items.summary_raw),
       discussion_url = coalesce(excluded.discussion_url, items.discussion_url),
       raw = items.raw || excluded.raw
     returning id, (xmax = 0) as inserted`,
    [
      src.id,
      item.externalId ?? null,
      canonical,
      hash,
      item.title.slice(0, 500),
      item.author?.slice(0, 120) ?? null,
      item.summaryRaw ?? null,
      item.discussionUrl ?? null,
      new Date(published).toISOString(),
      JSON.stringify({
        ...(item.raw ?? {}),
        slot_hint: item.slotHint ?? src.slot_hint ?? null,
        tags: item.tags ?? [],
      }),
    ],
  );
  if (!row) return false;

  await query(
    `insert into item_signals (item_id, points, comments, stars_total, captured_at)
     values ($1,$2,$3,$4, now())
     on conflict (item_id) do update set
       points      = greatest(excluded.points, item_signals.points),
       comments    = greatest(excluded.comments, item_signals.comments),
       stars_delta = case
         when excluded.stars_total is not null and item_signals.stars_total is not null
           then greatest(excluded.stars_total - item_signals.stars_total, 0)
         else item_signals.stars_delta
       end,
       stars_total = coalesce(excluded.stars_total, item_signals.stars_total),
       captured_at = now()`,
    [row.id, item.points ?? 0, item.comments ?? 0, item.starsTotal ?? null],
  );

  return row.inserted;
}

async function ingestSource(src: SourceRow): Promise<IngestResult> {
  const run = await one<{ id: string }>(
    `insert into fetch_runs (source_id) values ($1) returning id`,
    [src.id],
  );
  const runId = run!.id;

  try {
    const items = await FETCHERS[src.kind](src);
    let inserted = 0;
    for (const item of items) {
      if (!item?.url || !item.title) continue;
      if (await writeItem(src, item)) inserted++;
    }
    await query(
      `update fetch_runs set finished_at = now(), ok = true, items_seen = $2, items_new = $3 where id = $1`,
      [runId, items.length, inserted],
    );
    await query(`update sources set last_fetched_at = now(), last_error = null where id = $1`, [src.id]);
    log.info(`${src.slug}: ${items.length} seen, ${inserted} new`);
    return { source: src.slug, ok: true, seen: items.length, inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(
      `update fetch_runs set finished_at = now(), ok = false, error = $2 where id = $1`,
      [runId, msg.slice(0, 500)],
    );
    await query(`update sources set last_fetched_at = now(), last_error = $2 where id = $1`, [
      src.id,
      msg.slice(0, 500),
    ]);
    log.warn(`${src.slug}: ${msg}`);
    return { source: src.slug, ok: false, seen: 0, inserted: 0, error: msg };
  }
}

export async function ingestAll(only?: string[]): Promise<IngestResult[]> {
  const sources = await query<SourceRow>(
    `select id, slug, name, kind, feed_url, trust_weight, slot_hint, tags
       from sources where enabled = true order by kind, slug`,
  );
  const selected = only?.length
    ? sources.filter((s) => only.includes(s.slug) || only.includes(s.kind))
    : sources;

  log.info(`ingesting ${selected.length} sources`);
  // One source per worker; each fetcher already parallelises internally.
  return await mapLimit(selected, 6, (src) => ingestSource(src));
}
