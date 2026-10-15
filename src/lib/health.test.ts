import assert from "node:assert/strict";
import { test } from "node:test";
import { verdicts, type HealthFacts } from "./health";

/** A stack where nothing is wrong. Each test breaks one thing. */
function facts(over: Partial<HealthFacts> = {}): HealthFacts {
  return {
    expected: "2026-10-16",
    editionDate: "2026-10-16",
    editionStatus: "frozen",
    editionEntries: 19,
    editionBehindDays: 0,
    ingestHoursAgo: 1,
    sourcesEnabled: 92,
    sourcesFailing: 0,
    failingSlugs: [],
    runwayDays: 53,
    booksScheduled: 12,
    nextBookDate: "2026-10-16",
    storageBytes: 14_000_000,
    storagePretty: "14 MB",
    storagePct: 3,
    storageCapMb: 500,
    ...over,
  };
}

test("a working stack reports nothing at all", () => {
  assert.deepEqual(verdicts(facts()), { problems: [], warnings: [] });
});

test("yesterday's edition is not yet a problem", () => {
  // Before the freeze hour the newest edition is legitimately a day old.
  assert.deepEqual(verdicts(facts({ editionBehindDays: 1 })).problems, []);
});

test("an edition two days behind is a problem", () => {
  assert.match(verdicts(facts({ editionBehindDays: 2 })).problems[0], /2 days behind 2026-10-16/);
});

test("an empty database is a problem, not a warning", () => {
  const v = verdicts(facts({ editionDate: null, editionBehindDays: null }));
  assert.deepEqual(v.problems, ["no edition has ever been cut"]);
});

test("ingest inside the edition window is fine, outside it is not", () => {
  assert.deepEqual(verdicts(facts({ ingestHoursAgo: 36 })).problems, []);
  assert.match(verdicts(facts({ ingestHoursAgo: 37 })).problems[0], /finished 37h ago/);
  assert.deepEqual(verdicts(facts({ ingestHoursAgo: null })).problems, ["no ingest has ever run"]);
});

test("a few failing feeds warn and name themselves", () => {
  const v = verdicts(facts({ sourcesFailing: 2, failingSlugs: ["a", "b"] }));
  assert.deepEqual(v.problems, []);
  assert.match(v.warnings[0], /2 source\(s\) failing: a, b/);
});

test("the slug list in a warning is capped", () => {
  const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const v = verdicts(facts({ sourcesFailing: 8, failingSlugs: slugs }));
  assert.ok(v.warnings[0]?.endsWith("a, b, c, d, e, f"));
});

test("more than a quarter of the feeds failing is a problem, not a warning", () => {
  // Exactly a quarter still only warns; the next one over is the problem.
  const at = verdicts(facts({ sourcesEnabled: 92, sourcesFailing: 23, failingSlugs: ["a"] }));
  assert.deepEqual(at.problems, []);
  assert.equal(at.warnings.length, 1);

  const over = verdicts(facts({ sourcesEnabled: 92, sourcesFailing: 24, failingSlugs: ["a"] }));
  assert.match(over.problems[0], /24 of 92 enabled sources are failing/);
  assert.deepEqual(over.warnings, []);
});

test("a curriculum that has run out is a problem, a thin one is a warning", () => {
  assert.match(verdicts(facts({ runwayDays: 0 })).problems[0], /no units are scheduled/);
  assert.match(verdicts(facts({ runwayDays: 13 })).warnings[0], /only 13 days of units/);
  assert.deepEqual(verdicts(facts({ runwayDays: 14 })).warnings, []);
});

test("storage warns at 70% and fails at 90%", () => {
  assert.deepEqual(verdicts(facts({ storagePct: 69 })).warnings, []);
  assert.match(verdicts(facts({ storagePct: 70 })).warnings[0], /70% of the 500MB cap/);
  assert.deepEqual(verdicts(facts({ storagePct: 89 })).problems, []);
  assert.match(verdicts(facts({ storagePct: 90 })).problems[0], /90% of the 500MB cap/);
});

test("an unmigrated shelf is silent, an empty one warns", () => {
  assert.deepEqual(verdicts(facts({ booksScheduled: null })).warnings, []);
  assert.match(verdicts(facts({ booksScheduled: 0 })).warnings[0], /no books are scheduled/);
});

test("problems and warnings accumulate rather than shadowing each other", () => {
  const v = verdicts(facts({ editionBehindDays: 4, ingestHoursAgo: 90, runwayDays: 3 }));
  assert.equal(v.problems.length, 2);
  assert.equal(v.warnings.length, 1);
});
