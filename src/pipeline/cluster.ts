import { query, one } from "../lib/db";
import { titleKey, urlHash } from "../lib/url";
import type { Candidate } from "./candidates";

export type Cluster = {
  id: string;
  items: Candidate[];
  primary: Candidate;
  title: string;
  url: string;
  domain: string;
  publishedAt: Date;
  mentionCount: number;
  sources: string[];
  points: number;
  comments: number;
  starsTotal: number | null;
  starsDelta: number | null;
  discussionUrl: string | null;
  summaryRaw: string | null;
  tags: string[];
};

const AGGREGATORS = new Set(["news.ycombinator.com", "reddit.com", "lobste.rs"]);
const TITLE_THRESHOLD = 0.55;

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

class DisjointSet {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/**
 * Group candidates into stories. Identical canonical URLs merge outright;
 * near-identical titles merge the case where four outlets write up one release.
 */
export function groupCandidates(candidates: Candidate[]): Candidate[][] {
  const ds = new DisjointSet(candidates.length);

  const byUrl = new Map<string, number>();
  candidates.forEach((c, i) => {
    const key = urlHash(c.url_canonical);
    const seen = byUrl.get(key);
    if (seen === undefined) byUrl.set(key, i);
    else ds.union(seen, i);
  });

  const keys = candidates.map((c) => titleKey(c.title));
  const grams = keys.map(trigrams);

  for (let i = 0; i < candidates.length; i++) {
    if (keys[i].length < 18) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      if (keys[j].length < 18) continue;
      if (ds.find(i) === ds.find(j)) continue;
      // Two different repos are two different stories, whatever the names look like.
      if (
        candidates[i].domain === "github.com" &&
        candidates[j].domain === "github.com" &&
        candidates[i].url_canonical !== candidates[j].url_canonical
      ) {
        continue;
      }
      if (jaccard(grams[i], grams[j]) >= TITLE_THRESHOLD) ds.union(i, j);
    }
  }

  const groups = new Map<number, Candidate[]>();
  candidates.forEach((c, i) => {
    const root = ds.find(i);
    const list = groups.get(root);
    if (list) list.push(c);
    else groups.set(root, [c]);
  });
  return [...groups.values()];
}

function pickPrimary(group: Candidate[]): Candidate {
  return [...group].sort((a, b) => {
    const aggA = AGGREGATORS.has(a.domain) ? 1 : 0;
    const aggB = AGGREGATORS.has(b.domain) ? 1 : 0;
    if (aggA !== aggB) return aggA - aggB;
    if (b.trust_weight !== a.trust_weight) return b.trust_weight - a.trust_weight;
    return b.points + b.comments - (a.points + a.comments);
  })[0];
}

function tagsOf(group: Candidate[]): string[] {
  const out = new Set<string>();
  for (const c of group) {
    const raw = c.raw as { tags?: unknown };
    if (Array.isArray(raw?.tags)) {
      for (const t of raw.tags) if (typeof t === "string" && t) out.add(t.toLowerCase());
    }
  }
  return [...out].slice(0, 10);
}

/** Builds the in-memory view of one story. No database involved. */
export function makeCluster(group: Candidate[], id: string): Cluster {
  const primary = pickPrimary(group);
  const sources = [...new Set(group.map((c) => c.source_slug))];
  const discussion =
    [...group]
      .filter((c) => c.discussion_url)
      .sort((a, b) => b.points + b.comments - (a.points + a.comments))[0]?.discussion_url ?? null;

  return {
    id,
    items: group,
    primary,
    title: primary.title,
    url: primary.url_canonical,
    domain: primary.domain,
    publishedAt: new Date(Math.max(...group.map((c) => new Date(c.published_at).getTime()))),
    mentionCount: sources.length,
    sources,
    points: Math.max(...group.map((c) => c.points)),
    comments: Math.max(...group.map((c) => c.comments)),
    starsTotal: group.reduce<number | null>((m, c) => c.stars_total ?? m, null),
    starsDelta: group.reduce<number | null>((m, c) => c.stars_delta ?? m, null),
    discussionUrl: discussion,
    summaryRaw: group.find((c) => c.summary_raw)?.summary_raw ?? null,
    tags: tagsOf(group),
  };
}

/** Groups candidates without touching the database, for dry runs. */
export function clusterInMemory(candidates: Candidate[]): Cluster[] {
  return groupCandidates(candidates).map((g, i) => makeCluster(g, `mem-${i}`));
}

/** Persists groups as clusters, reusing any cluster an item already belongs to. */
export async function persistClusters(groups: Candidate[][]): Promise<Cluster[]> {
  const out: Cluster[] = [];

  for (const group of groups) {
    const primary = pickPrimary(group);
    const itemIds = group.map((c) => c.item_id);

    const existing = await query<{ cluster_id: string }>(
      `select distinct cluster_id from cluster_items where item_id = any($1::bigint[])`,
      [itemIds],
    );

    let clusterId: string;
    if (existing.length) {
      clusterId = existing.map((e) => e.cluster_id).sort()[0];
    } else {
      const row = await one<{ id: string }>(
        `insert into clusters (primary_item_id, title, url_canonical, domain, first_seen_at)
         values ($1,$2,$3,$4,$5) returning id`,
        [primary.item_id, primary.title, primary.url_canonical, primary.domain, primary.published_at],
      );
      clusterId = row!.id;
    }

    // `do update` rather than `do nothing`: when a group spans two existing
    // clusters they must actually merge, or the same story keeps a second
    // cluster id and can be published twice.
    for (const id of itemIds) {
      await query(
        `insert into cluster_items (cluster_id, item_id) values ($1,$2)
         on conflict (item_id) do update set cluster_id = excluded.cluster_id`,
        [clusterId, id],
      );
    }

    const cluster = makeCluster(group, clusterId);
    await query(
      `update clusters set title = $2, url_canonical = $3, domain = $4,
              primary_item_id = $5, mention_count = greatest(mention_count, $6), updated_at = now()
        where id = $1`,
      [clusterId, cluster.title, cluster.url, cluster.domain, primary.item_id, cluster.mentionCount],
    );
    out.push(cluster);
  }

  return out;
}
