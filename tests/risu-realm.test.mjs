import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { crawl, meta, listUrl, cleanDesc, parseCount } from "../crawler/adapters/risu-realm.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";
const page = JSON.parse(fs.readFileSync("fixtures/realm-list.json", "utf8"));
test("helpers: list url encodes the client's argument string; cleanDesc picks the `en` block and strips markdown; parseCount", () => {
  assert.equal(listUrl({ page: 2, nsfw: true, sort: "trending" }), meta.hub + "/realm/" + encodeURIComponent("search== __shared&&page==2&&nsfw==true&&sort==trending&&web==web") + "?cache=30");
  assert.equal(cleanDesc("\n# `en`\n \nA star idol who never sleeps.\n# `ko`\n스타"), "A star idol who never sleeps."); assert.equal(cleanDesc("## Title\n\nPlain **bold** text here."), "Plain bold text here."); assert.equal(cleanDesc(null), "");
  assert.equal(parseCount("8.4k"), 8400); assert.equal(parseCount("600"), 600); assert.equal(parseCount("1.2m"), 1200000); assert.equal(parseCount("x"), 0);
});
test("crawl: walks sorts × pages, dedups ids, skips hidden and malformed, nsfw pass marks only unseen ids, stops a sort on a short page; records validate", async () => {
  const seen = []; const impl = fakeFetch([{ match: /sort%3D%3Ddownloads.*nsfw%3D%3Dfalse|nsfw%3D%3Dfalse.*sort%3D%3Ddownloads/, body: page }, { match: /nsfw%3D%3Dtrue/, body: { cards: [page.cards[0], { name: "Spicy", desc: "d", id: "33333333-2222-3333-4444-555555555555", tags: [], hidden: 0, type: "normal" }] } }, { match: /realm\//, body: { cards: [] } }]);
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  const { records, errors } = await crawl(f, { ts: 4, limits: { pagesPerSort: { downloads: 3, trending: 1, "": 1, random: 1 }, maxRequests: 50 } });
  assert.equal(errors.length, 0); assert.equal(records.length, 3);
  const a = records.find(r => r.id.endsWith("04fff0c7-88df-471c-adbf-4a5c37b2a304")); assert.equal(a.n, "T.T.STAR"); assert.equal(a.b, "A star idol who never sleeps."); assert.deepEqual(a.t, ["game-character", "female"]); assert.equal(a.nsfw, false); assert.equal(a.c, "https://sv.risuai.xyz/resource/7833baf2bc9df19abb3cf5e0fca3548eb43b97f6041c18099400908e5435dddd", "a 64-hex img becomes a resource cover"); assert.equal(a.p.f, "charx"); assert.equal(a.p.tr, "plain"); assert.equal(a.p.u, meta.downloadBase + a.id.split(":")[2] + "?cors=true"); assert.equal(a.o, meta.originBase + "04fff0c7-88df-471c-adbf-4a5c37b2a304");
  assert.equal(records.find(r => r.n === "Spicy").nsfw, true, "only in the nsfw pass"); assert.equal(records.find(r => r.n === "Marked up").nsfw, false);
  for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
  assert.ok(impl.calls.some(c => c.opts && c.opts.headers && c.opts.headers["x-risuai-info"]), "sends the client header");
  assert.ok(impl.calls.length <= 10, "short page stops the sort: " + impl.calls.length);
});
test("crawl: list endpoint down → error recorded, no records, no throw", async () => { const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: /realm\//, status: 500, body: "x", kind: "text" }]) }); const r = await crawl(f, { ts: 1, limits: { pagesPerSort: { downloads: 1 }, maxRequests: 3 } }); assert.equal(r.records.length, 0); assert.ok(r.errors.length >= 1); });
