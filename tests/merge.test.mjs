import test from "node:test";
import assert from "node:assert/strict";
import { mergeWithPrevious, sameContent, PRUNE_DAYS } from "../crawler/lib/merge.mjs";
const DAY = 86400;
const rec = (id, ts, extra = {}) => ({ id, k: "character", src: "s", n: "n", b: "", t: [], c: null, nsfw: false, o: "https://o/", p: { tr: null, u: null, f: null }, caps: { s: "index", i: false, o: true }, tok: null, ts, ...extra });

test("sameContent ignores ts only", () => {
  assert.equal(sameContent(rec("a", 1), rec("a", 2)), true);
  assert.equal(sameContent(rec("a", 1), rec("a", 1, { n: "x" })), false);
});
test("sameContent: nsfw record from a shard (b:null) equals a fresh one carrying its blurb", () => {
  assert.equal(sameContent(rec("a", 1, { nsfw: true, b: null }), rec("a", 2, { nsfw: true, b: "the blurb" })), true);
  assert.equal(sameContent(rec("a", 1, { nsfw: false, b: "" }), rec("a", 2, { nsfw: false, b: "the blurb" })), false);
});
test("changed record is replaced and carries the new ts; unchanged keeps old bytes", () => {
  const { records, seen } = mergeWithPrevious([rec("a", 100, { n: "old" }), rec("b", 100)], [rec("a", 200, { n: "new" }), rec("b", 200)], { now: 200 });
  assert.equal(records.find(r => r.id === "a").ts, 200); assert.equal(records.find(r => r.id === "b").ts, 100, "unchanged record keeps ts");
  assert.deepEqual(seen, { a: 200, b: 200 });
});
test("previous records not seen this crawl are kept until PRUNE_DAYS, using prevSeen", () => {
  const now = 1000 * DAY;
  const prev = [rec("keep", 1), rec("drop", 1)];
  const prevSeen = { keep: now - (PRUNE_DAYS - 1) * DAY, drop: now - (PRUNE_DAYS + 1) * DAY };
  const { records, seen } = mergeWithPrevious(prev, [], { now, prevSeen });
  assert.deepEqual(records.map(r => r.id), ["keep"]); assert.deepEqual(Object.keys(seen), ["keep"]);
});
test("prevSeen missing → falls back to record ts", () => {
  const now = 1000 * DAY;
  const { records } = mergeWithPrevious([rec("old", now - (PRUNE_DAYS + 5) * DAY)], [], { now });
  assert.equal(records.length, 0);
});
test("when the crawl failed (crawlOk=false) nothing is pruned", () => {
  const now = 1000 * DAY;
  const { records } = mergeWithPrevious([rec("old", now - 400 * DAY)], [], { now, crawlOk: false });
  assert.equal(records.length, 1);
});
test("output is sorted by id for stable shards", () => {
  const { records } = mergeWithPrevious([], [rec("b", 1), rec("a", 1)], { now: 1 }); assert.deepEqual(records.map(r => r.id), ["a", "b"]);
});
