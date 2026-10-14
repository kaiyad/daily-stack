import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countWords,
  currentShelfDate,
  fridayOnOrBefore,
  isFriday,
  nextFriday,
  readMinutes,
} from "./shelf";

// 2026-10-16 is a Friday; 2026-10-14 is the Wednesday before it.
test("a Friday is its own Friday", () => {
  assert.equal(fridayOnOrBefore("2026-10-16"), "2026-10-16");
});

test("a mid-week date belongs to the Friday behind it", () => {
  assert.equal(fridayOnOrBefore("2026-10-14"), "2026-10-09");
  assert.equal(fridayOnOrBefore("2026-10-15"), "2026-10-09");
});

test("Saturday and Sunday still belong to the Friday just gone", () => {
  assert.equal(fridayOnOrBefore("2026-10-17"), "2026-10-16");
  assert.equal(fridayOnOrBefore("2026-10-18"), "2026-10-16");
});

test("the next Friday is always seven days on, never today", () => {
  assert.equal(nextFriday("2026-10-16"), "2026-10-23");
  assert.equal(nextFriday("2026-10-14"), "2026-10-16");
});

test("stepping forward crosses a month and a year end", () => {
  assert.equal(nextFriday("2026-10-30"), "2026-11-06");
  assert.equal(nextFriday("2026-12-31"), "2027-01-01");
});

test("only Fridays are Fridays", () => {
  assert.ok(isFriday("2026-10-16"));
  assert.ok(!isFriday("2026-10-15"));
});

// The zone and publish hour are passed in, so these do not depend on whatever
// EDITION_TZ the local .env happens to carry.
const shelfAt = (iso: string) => currentShelfDate(new Date(iso), "UTC", 21);

test("Friday before the publish hour still shows last week's book", () => {
  assert.equal(shelfAt("2026-10-16T20:59:00Z"), "2026-10-09");
});

test("the new book appears on the publish hour, not a minute before", () => {
  assert.equal(shelfAt("2026-10-16T21:00:00Z"), "2026-10-16");
});

test("every day after publication shows that Friday's book", () => {
  assert.equal(shelfAt("2026-10-19T09:00:00Z"), "2026-10-16");
  assert.equal(shelfAt("2026-10-22T23:00:00Z"), "2026-10-16");
});

test("the publish hour is read in the given zone, not UTC", () => {
  // 16:00 UTC on Friday is 21:30 in Asia/Kolkata - published there, not yet in
  // London, which is exactly the window the cron is aimed at.
  assert.equal(currentShelfDate(new Date("2026-10-16T16:00:00Z"), "Asia/Kolkata", 21), "2026-10-16");
  assert.equal(currentShelfDate(new Date("2026-10-16T16:00:00Z"), "Europe/London", 21), "2026-10-09");
});

test("reading time never rounds a real piece down to zero", () => {
  assert.equal(readMinutes(0), 1);
  assert.equal(readMinutes(4400), 20);
});

test("word count ignores the whitespace a model leaves behind", () => {
  assert.equal(countWords("  two   words\n\n"), 2);
  assert.equal(countWords(""), 0);
});
