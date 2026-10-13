import { SLOTS, type SlotId } from "../lib/slots";
import type { Scored } from "./score";

export type Selection = { slot: SlotId; rank: number; entry: Scored };

const CODE_HOSTS = new Set(["github.com", "gitlab.com", "codeberg.org"]);
const MAX_PER_DOMAIN = 2;

/** A repo's identity is its path, so one code host can supply several entries. */
function diversityKey(e: Scored): string {
  return CODE_HOSTS.has(e.cluster.domain) ? e.cluster.url : e.cluster.domain;
}

function aiQuota(limit: number): number {
  return Math.max(1, Math.floor(limit * 0.5));
}

/**
 * Greedy fill, slot by slot, under three constraints: nothing published twice,
 * no domain more than twice in one edition, and a per-slot AI ceiling.
 */
export function select(
  scored: Scored[],
  featured: { clusters: Set<string>; urls: Set<string> },
): Selection[] {
  const pool = scored
    .filter((e) => !featured.clusters.has(e.cluster.id) && !featured.urls.has(e.cluster.url))
    .sort((a, b) => b.score - a.score);

  const used = new Set<string>();
  const domainCount = new Map<string, number>();
  const perSlotDomain = new Set<string>();
  const out: Selection[] = [];

  const take = (e: Scored, slot: SlotId, rank: number) => {
    used.add(e.cluster.id);
    const key = diversityKey(e);
    domainCount.set(key, (domainCount.get(key) ?? 0) + 1);
    perSlotDomain.add(`${slot}:${key}`);
    out.push({ slot, rank, entry: e });
  };

  // Twice per edition at most, and never twice in the same section - two
  // entries from one vendor blog in a three-item section reads as a press page.
  const admissible = (e: Scored, slot: SlotId) =>
    !used.has(e.cluster.id) &&
    (domainCount.get(diversityKey(e)) ?? 0) < MAX_PER_DOMAIN &&
    !perSlotDomain.has(`${slot}:${diversityKey(e)}`);

  for (const slot of SLOTS) {
    const quota = aiQuota(slot.limit);
    let aiTaken = 0;
    let rank = 1;

    for (const e of pool) {
      if (rank > slot.limit) break;
      if (e.slot !== slot.id || !admissible(e, slot.id)) continue;
      if (slot.id !== "ai" && e.isAi && aiTaken >= quota) continue;
      if (e.isAi) aiTaken++;
      take(e, slot.id, rank++);
    }
  }

  // Quiet days leave Top Reads short; backfill it from whatever is left rather
  // than publishing a half-empty section.
  const reads = SLOTS.find((s) => s.id === "reads")!;
  let readRank = out.filter((s) => s.slot === "reads").length + 1;
  if (readRank <= reads.limit) {
    for (const e of pool) {
      if (readRank > reads.limit) break;
      if (!admissible(e, "reads")) continue;
      take(e, "reads", readRank++);
    }
  }

  return out.sort((a, b) => {
    const ai = SLOTS.findIndex((s) => s.id === a.slot);
    const bi = SLOTS.findIndex((s) => s.id === b.slot);
    return ai - bi || a.rank - b.rank;
  });
}
