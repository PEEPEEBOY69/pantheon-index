import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crawl, meta } from "../crawler/adapters/perchance-rp.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { validateRecord } from "../crawler/lib/record.mjs";

const sample = JSON.parse(fs.readFileSync("fixtures/prp-sample.json", "utf8"));
test("meta describes the source", () => { assert.equal(meta.id, "perchance-rp"); assert.deepEqual(meta.kinds, ["scenario"]); assert.match(meta.probe, /^https:\/\/user\.uploads\.dev\//); });
test("crawl slices the blob into scenario records, nsfw from tags, cover from cardImage", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: meta.blobUrl, body: sample }]), minIntervalMs: 0 });
  const { records, errors } = await crawl(f, { ts: 5 });
  assert.equal(errors.length, 0); assert.equal(records.length, 2);
  assert.equal(records[0].id, "perchance-rp:scenario:every-trick-works-once"); assert.equal(records[0].b, "It hunts the town one night a month."); assert.equal(records[0].c, sample[0].cardImage);
  assert.equal(records[0].p.tr, "index"); assert.equal(records[0].p.f, "prp"); assert.equal(records[0].caps.i, true); assert.equal(records[0].o, "https://perchance.org/ai-rpg#every-trick-works-once");
  assert.equal(records[1].nsfw, true);
  records.forEach(r => assert.equal(validateRecord(r).ok, true));
});
test("crawl: non-array body → one error, zero records", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: meta.blobUrl, body: { nope: 1 } }]), minIntervalMs: 0 });
  const { records, errors } = await crawl(f, { ts: 5 }); assert.equal(records.length, 0); assert.equal(errors.length, 1);
});
