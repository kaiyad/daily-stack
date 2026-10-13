import { query } from "../lib/db";
import { editionWindow } from "../lib/dates";
import { domainOf } from "../lib/url";

export type CandidateRow = {
  item_id: string;
  title: string;
  url_canonical: string;
  summary_raw: string | null;
  discussion_url: string | null;
  published_at: Date;
  raw: Record<string, unknown>;
  source_slug: string;
  source_name: string;
  kind: string;
  trust_weight: number;
  slot_hint: string | null;
  points: number;
  comments: number;
  stars_total: number | null;
  stars_delta: number | null;
};

export type Candidate = CandidateRow & { domain: string };

export const PAPER_WINDOW_DAYS = 7;

/**
 * Items eligible for an edition: published inside the window, or a repo whose
 * star count moved inside the window (a repo trending today may be years old).
 */
export async function loadCandidates(editionDate: string): Promise<Candidate[]> {
  const { startAt, endAt } = editionWindow(editionDate);

  const rows = await query<CandidateRow>(
    `select i.id as item_id, i.title, i.url_canonical, i.summary_raw, i.discussion_url,
            i.published_at, i.raw,
            s.slug as source_slug, s.name as source_name, s.kind,
            s.trust_weight, s.slot_hint,
            coalesce(sig.points, 0) as points,
            coalesce(sig.comments, 0) as comments,
            sig.stars_total, sig.stars_delta
       from items i
       join sources s on s.id = i.source_id
       left join item_signals sig on sig.item_id = i.id
      where (i.published_at >= $1 and i.published_at < $2)
         or (coalesce(sig.stars_delta, 0) >= 25
             and sig.captured_at >= $1 and sig.captured_at < $2)
         -- Papers are not news and arrive in batches; a week-old paper is
         -- still a fine Deep entry, so they get a wider window.
         or (s.kind = 'arxiv' and i.published_at >= $3 and i.published_at < $2)`,
    [
      startAt.toISOString(),
      endAt.toISOString(),
      new Date(startAt.getTime() - 6 * 86_400_000).toISOString(),
    ],
  );

  return rows.map((r) => ({ ...r, domain: domainOf(r.url_canonical) }));
}

/**
 * Everything already published, by cluster id *and* by URL. The URL set is the
 * stronger guard: cluster ids can legitimately change when two clusters merge,
 * but a URL that has run once must never run again.
 */
export async function alreadyFeatured(
  excludeDate: string,
): Promise<{ clusters: Set<string>; urls: Set<string> }> {
  // The edition being built is excluded, or rebuilding a draft would treat its
  // own entries as already published and empty it.
  const rows = await query<{ cluster_id: string; url: string }>(
    `select distinct cluster_id, url from edition_slots where edition_date <> $1`,
    [excludeDate],
  );
  return {
    clusters: new Set(rows.map((r) => r.cluster_id)),
    urls: new Set(rows.map((r) => r.url)),
  };
}

/** How often each domain has appeared in the last `days` of editions. */
export async function recentDomainCounts(
  editionDate: string,
  days = 7,
): Promise<Map<string, number>> {
  const rows = await query<{ domain: string; n: string }>(
    `select domain, count(*)::text as n
       from edition_slots
      where edition_date < $1 and edition_date >= ($1::date - $2::int)
      group by domain`,
    [editionDate, days],
  );
  return new Map(rows.map((r) => [r.domain, Number(r.n)]));
}
