import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { crawl, meta, cardUrl, coverUrl } from "../crawler/adapters/character-tavern.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";
const sections = JSON.parse(fs.readFileSync("fixtures/ct-sections.json", "utf8"));
test("meta + urls", () => { assert.equal(meta.id, "character-tavern"); assert.equal(cardUrl("a b/c"), "https://ct-cards.storage.character-tavern.com/a%20b/c.png"); assert.ok(coverUrl("a/b").includes("?width=320")); });
test("crawl: three sections merged by path, section names become tags, bad paths skipped, records validate", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: meta.sectionsUrl, body: sections }]) });
  const { records, errors } = await crawl(f, { ts: 5 }); assert.equal(errors.length, 0); assert.equal(records.length, 3);
  const k = records.find(r => r.nid === undefined || r.id.endsWith("d3spair/kohaku_the_homeless_foxgirl")); assert.ok(k); assert.deepEqual(k.t, ["trending", "newest"]); assert.equal(k.n, "Kohaku the homeless Foxgirl"); assert.equal(k.tok, 796); assert.equal(k.p.f, "ccv2png"); assert.equal(k.p.tr, "plain"); assert.equal(k.o, "https://character-tavern.com/character/d3spair/kohaku_the_homeless_foxgirl");
  assert.equal(records.find(r => r.id.endsWith("lyssa_thorne")).nsfw, true); for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
});
test("crawl: endpoint down → no records, one error", async () => { const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([]) }); const r = await crawl(f, { ts: 1 }); assert.equal(r.records.length, 0); assert.equal(r.errors.length, 1); });
