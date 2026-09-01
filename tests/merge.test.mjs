import test from "node:test";
import assert from "node:assert/strict";
import { mergeWithPrevious, PRUNE_DAYS } from "../crawler/lib/merge.mjs";
const DAY = 86400;
const rec = (id, ts, extra = {}) => ({ id, k: "character", src: "s", n: "n", b: "", t: [], c: null, nsfw: false, o: "https://o/", p: { tr: null, u: null, f: null }, caps: { s: "index", i: false, o: true }, tok: null, ts, ...extra });

test("new records replace previous by id and carry the new ts", () => {
  const out = mergeWithPrevious([rec("a", 100, { n: "old" })], [rec("a", 200, { n: "new" })], { now: 200 });
  assert.equal(out.length, 1); assert.equal(out[0].n, "new"); assert.equal(out[0].ts, 200);
});
test("previous records not seen this crawl are kept until PRUNE_DAYS", () => {
  const now = 1000 * DAY;
  const out = mergeWithPrevious([rec("keep", now - (PRUNE_DAYS - 1) * DAY), rec("drop", now - (PRUNE_DAYS + 1) * DAY)], [], { now });
  assert.deepEqual(out.map(r => r.id), ["keep"]);
});
test("when the crawl failed (crawlOk=false) nothing is pruned", () => {
  const now = 1000 * DAY;
  const out = mergeWithPrevious([rec("old", now - 400 * DAY)], [], { now, crawlOk: false });
  assert.equal(out.length, 1);
});
test("output is sorted by id for stable shards", () => {
  const out = mergeWithPrevious([], [rec("b", 1), rec("a", 1)], { now: 1 }); assert.deepEqual(out.map(r => r.id), ["a", "b"]);
});
