import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "./dates";
import { dueRevisions, type PublishedUnit } from "./revision";

const unit = (slug: string, originDate: string): PublishedUnit => ({
  conceptId: Number(slug.replace(/\D/g, "")) || 1,
  slug,
  title: slug,
  kind: "concept",
  question: `q-${slug}`,
  answer: `a-${slug}`,
  originDate,
});

/** Every date from `from` up to but excluding `to`. */
function daily(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

test("comes back three days after it was published", () => {
  const past = daily("2026-01-01", "2026-01-04");
  const due = dueRevisions("2026-01-04", past, [unit("u1", "2026-01-01")]);
  assert.equal(due.length, 1);
  assert.equal(due[0].intervalDays, 3);
  assert.equal(due[0].elapsedDays, 3);
});

test("is not due before its first interval", () => {
  const past = daily("2026-01-01", "2026-01-03");
  assert.deepEqual(dueRevisions("2026-01-03", past, [unit("u1", "2026-01-01")]), []);
});

test("is not repeated in the edition after the one that carried it", () => {
  const units = [unit("u1", "2026-01-01")];
  assert.equal(dueRevisions("2026-01-04", daily("2026-01-01", "2026-01-04"), units).length, 1);
  assert.equal(dueRevisions("2026-01-05", daily("2026-01-01", "2026-01-05"), units).length, 0);
});

test("a skipped edition postpones a recall instead of losing it", () => {
  // No edition on the 4th, so the +3 recall lands on the 5th.
  const past = ["2026-01-01", "2026-01-02", "2026-01-03"];
  assert.equal(dueRevisions("2026-01-05", past, [unit("u1", "2026-01-01")])[0].intervalDays, 3);
});

test("a long gap collapses overlapping intervals into the longest one", () => {
  // First edition in a month: +3, +10 and +30 all resolve here.
  const due = dueRevisions("2026-02-01", ["2026-01-01"], [unit("u1", "2026-01-01")]);
  assert.equal(due.length, 1);
  assert.equal(due[0].intervalDays, 30);
  assert.equal(due[0].elapsedDays, 31);
});

test("all three intervals fire, each on its own edition", () => {
  const units = [unit("u1", "2026-01-01")];
  const hit = daily("2026-01-02", "2026-02-10")
    .filter((d) => dueRevisions(d, daily("2026-01-01", d), units).length === 1)
    .map((d) => d);
  assert.deepEqual(hit, ["2026-01-04", "2026-01-11", "2026-01-31"]);
});

test("shortest interval first, and never more than the cap", () => {
  const past = daily("2026-01-01", "2026-02-01");
  const units = [
    unit("u1", "2026-01-02"), // +30 on 2026-02-01
    unit("u2", "2026-01-22"), // +10
    unit("u3", "2026-01-29"), // +3
    unit("u4", "2026-01-01"), // +30 was 2026-01-31, already shown
  ];
  const due = dueRevisions("2026-02-01", past, units);
  assert.deepEqual(due.map((d) => d.slug), ["u3", "u2", "u1"]);
  assert.equal(dueRevisions("2026-02-01", past, units, 2).length, 2);
});
