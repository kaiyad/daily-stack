import type { Cluster } from "./cluster";
import type { SlotId } from "../lib/slots";
import { isAiTopic } from "./classify";
import { editionWindow } from "../lib/dates";
import { PAPER_WINDOW_DAYS } from "./candidates";

export type Scored = {
  cluster: Cluster;
  slot: SlotId;
  score: number;
  engagement: number;
  percentile: number;
  recency: number;
  penalty: number;
  isAi: boolean;
};

/** Raw engagement, on whatever scale the source happens to use. */
function engagementOf(c: Cluster): number | null {
  if (c.starsDelta !== null && c.starsDelta > 0) return c.starsDelta;
  if (c.points || c.comments) return c.points + 2 * c.comments;
  if (c.starsTotal !== null) return c.starsTotal / 40;
  return null; // feed-only source: no engagement signal at all
}

/**
 * Percentile rank within the item's own source. HN points and Reddit upvotes
 * are not the same unit, and comparing them directly hands the edition to
 * whichever site inflates numbers fastest.
 */
function percentileBySource(clusters: Cluster[]): Map<string, number> {
  const bySource = new Map<string, { id: string; value: number }[]>();

  for (const c of clusters) {
    const value = engagementOf(c);
    if (value === null) continue;
    const key = c.primary.source_slug;
    const list = bySource.get(key) ?? [];
    list.push({ id: c.id, value });
    bySource.set(key, list);
  }

  const out = new Map<string, number>();
  for (const list of bySource.values()) {
    const sorted = [...list].sort((a, b) => a.value - b.value);
    const n = sorted.length;
    sorted.forEach((entry, i) => {
      // A lone item from a source gets the neutral 0.5, not a free 1.0.
      out.set(entry.id, n === 1 ? 0.5 : i / (n - 1));
    });
  }
  return out;
}

/**
 * A changelog that posts forty entries a day should not out-rank a blog that
 * posts one considered piece, so each item carries a share of its source's
 * volume for the cycle.
 */
function volumePenalties(clusters: Cluster[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of clusters) {
    const k = c.primary.source_slug;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [slug, n] of counts) {
    out.set(slug, n <= 3 ? 0 : Math.min(0.12, Math.log(n / 3) * 0.05));
  }
  // Papers are exempt: the digest takes exactly one, so arXiv's volume cannot
  // crowd out anything, and penalising it just empties the Deep slot.
  for (const c of clusters) {
    if (c.primary.kind === "arxiv") out.set(c.primary.source_slug, 0);
  }
  return out;
}

export function scoreAll(
  clusters: Cluster[],
  slotOf: (c: Cluster) => SlotId,
  editionDate: string,
  recentDomains: Map<string, number>,
): Scored[] {
  const pct = percentileBySource(clusters);
  const volume = volumePenalties(clusters);
  const { startAt, endAt } = editionWindow(editionDate);
  const span = endAt.getTime() - startAt.getTime();

  return clusters.map((c) => {
    const percentile = pct.get(c.id) ?? 0.42;
    const trust = Math.min(c.primary.trust_weight, 2) / 2;
    const mention = Math.min(1, (c.mentionCount - 1) / 2);

    // Papers are eligible for a week, so they decay over a week; judging them
    // against the 36h news window would put every paper at the floor.
    const effectiveSpan = c.primary.kind === "arxiv" ? PAPER_WINDOW_DAYS * 86_400_000 : span;
    const age = Math.max(0, endAt.getTime() - c.publishedAt.getTime());
    const recency = Math.max(0.15, 1 - Math.min(1, age / effectiveSpan) * 0.85);

    // One blog colonises the edition without this term.
    const seen = recentDomains.get(c.domain) ?? 0;
    const penalty =
      Math.min(0.3, seen * 0.1) + (volume.get(c.primary.source_slug) ?? 0);

    const score =
      0.5 * percentile + 0.2 * trust + 0.15 * mention + 0.15 * recency - penalty;

    return {
      cluster: c,
      slot: slotOf(c),
      score: Math.max(0, Math.min(1, score)),
      engagement: engagementOf(c) ?? 0,
      percentile,
      recency,
      penalty,
      isAi: isAiTopic(c),
    };
  });
}
