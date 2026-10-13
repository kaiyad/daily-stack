export const SLOTS = [
  { id: "reads", label: "Top Reads", limit: 5, blurb: "Articles and engineering write-ups worth the full read." },
  { id: "shipped", label: "Shipped", limit: 4, blurb: "Releases, changelogs, cloud and language news." },
  { id: "repos", label: "Repos", limit: 3, blurb: "Projects gaining real traction, and what they actually do." },
  { id: "discussion", label: "Discussion", limit: 3, blurb: "Threads where the comments are the content." },
  { id: "ai", label: "AI", limit: 3, blurb: "Capped on purpose, so it does not eat the edition." },
  { id: "deep", label: "Deep", limit: 1, blurb: "One paper or long teardown." },
] as const;

export type SlotId = (typeof SLOTS)[number]["id"];

export const SLOT_IDS = SLOTS.map((s) => s.id) as SlotId[];
export const EDITION_BUDGET = SLOTS.reduce((n, s) => n + s.limit, 0);

export function slotMeta(id: string) {
  return SLOTS.find((s) => s.id === id);
}
