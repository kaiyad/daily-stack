/**
 * The edition carries exactly one teaching unit a day. What rotates is the
 * kind, not the number of slots: three units and an exercise every morning is
 * a study course, and this is a thing you read with coffee.
 */
export const UNIT_KINDS = [
  { id: "concept", label: "Concept", noun: "concept" },
  { id: "algorithm", label: "Algorithm", noun: "algorithm" },
  { id: "data-structure", label: "Data structure", noun: "data structure" },
  { id: "pattern", label: "Pattern", noun: "pattern" },
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number]["id"];

export const UNIT_KIND_IDS = UNIT_KINDS.map((k) => k.id) as UnitKind[];

export function unitLabel(kind: string): string {
  return UNIT_KINDS.find((k) => k.id === kind)?.label ?? "Concept";
}

/**
 * Indexed by `Date#getUTCDay`, so Sunday is 0. Three concepts, two algorithms,
 * one data structure and one pattern a week: weighted towards the pool that is
 * deepest, and weekends get the kinds that carry an exercise.
 */
export const ROTATION: readonly UnitKind[] = [
  "pattern", // Sun
  "concept", // Mon
  "algorithm", // Tue
  "concept", // Wed
  "data-structure", // Thu
  "concept", // Fri
  "algorithm", // Sat
];

/** The kind of unit a given edition date wants. */
export function kindForDate(ymd: string): UnitKind {
  const [y, m, d] = ymd.split("-").map(Number);
  return ROTATION[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
