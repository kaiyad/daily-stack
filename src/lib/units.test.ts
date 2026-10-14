import assert from "node:assert/strict";
import { test } from "node:test";
import { ROTATION, UNIT_KIND_IDS, kindForDate, unitLabel } from "./units";

test("the rotation covers a whole week", () => {
  assert.equal(ROTATION.length, 7);
  for (const kind of ROTATION) assert.ok(UNIT_KIND_IDS.includes(kind));
});

test("the weekly mix is three concepts, two algorithms, one structure, one pattern", () => {
  const count = (k: string) => ROTATION.filter((r) => r === k).length;
  assert.equal(count("concept"), 3);
  assert.equal(count("algorithm"), 2);
  assert.equal(count("data-structure"), 1);
  assert.equal(count("pattern"), 1);
});

test("a date maps to its weekday's kind", () => {
  // 2026-10-12 is a Monday.
  assert.equal(kindForDate("2026-10-12"), "concept");
  assert.equal(kindForDate("2026-10-13"), "algorithm");
  assert.equal(kindForDate("2026-10-15"), "data-structure");
  assert.equal(kindForDate("2026-10-18"), "pattern");
  assert.equal(kindForDate("2026-10-19"), kindForDate("2026-10-12"));
});

test("labels fall back rather than throwing on an unknown kind", () => {
  assert.equal(unitLabel("data-structure"), "Data structure");
  assert.equal(unitLabel("nonsense"), "Concept");
});
