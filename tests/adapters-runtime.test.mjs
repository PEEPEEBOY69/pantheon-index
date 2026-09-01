import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAdapter, buildSearchUrl, itemsToRecords, crawlDeclarative } from "../crawler/lib/adapters-runtime.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { validateRecord } from "../crawler/lib/record.mjs";

const chub = JSON.parse(fs.readFileSync("crawler/adapters/chub.json", "utf8"));
const fl = JSON.parse(fs.readFileSync("crawler/adapters/fictionlab.json", "utf8"));
const chubFx = JSON.parse(fs.readFileSync("fixtures/chub-search.json", "utf8"));
const flFx = JSON.parse(fs.readFileSync("fixtures/fictionlab-search.json", "utf8"));

test("validateAdapter accepts the shipped descriptors", () => { assert.equal(validateAdapter(chub).ok, true); assert.equal(validateAdapter(fl).ok, true); });
test("validateAdapter rejects unknown transport / missing map keys", () => {
  assert.equal(validateAdapter({ ...chub, transport: "magic" }).ok, false);
  assert.ok(validateAdapter({ ...chub, search: { ...chub.search, map: { n: "name" } } }).errors.some(e => e.includes("map.nid")));
});
test("buildSearchUrl maps only declared controls, applies fixed and sorts", () => {
  const u = new URL(buildSearchUrl(chub, { q: "elf", sort: "popular", page: 2, bogus: "x" }));
  assert.equal(u.searchParams.get("search"), "elf"); assert.equal(u.searchParams.get("sort"), "download_count");
  assert.equal(u.searchParams.get("page"), "2"); assert.equal(u.searchParams.get("namespace"), "characters"); assert.equal(u.searchParams.has("bogus"), false);
});
test("itemsToRecords: chub nodes → records; blank name skipped; nsfw from nsfw_image", () => {
  const { records, skipped } = itemsToRecords(chub, chubFx.data.nodes, { ts: 1756700000 });
  assert.equal(records.length, 2); assert.equal(skipped, 1);
  const a = records[0];
  assert.equal(a.id, "chub:character:101"); assert.deepEqual(a.t, ["fantasy", "elf"]); assert.equal(a.p.u, "https://avatars.charhub.io/avatars/cash/alice/chara_card_v2.png"); assert.equal(a.p.f, "ccv2png"); assert.equal(a.p.tr, "plain"); assert.equal(a.tok, 812);
  assert.equal(records[1].nsfw, true); assert.equal(records[1].b, "A blacksmith."); assert.equal(records[1].c, "https://avatars.charhub.io/avatars/someone/bob/chara_card_v2.png");
  records.forEach(r => assert.equal(validateRecord(r).ok, true, JSON.stringify(validateRecord(r))));
});
test("itemsToRecords: fictionlab → scenario records with super transport", () => {
  const { records } = itemsToRecords(fl, flFx.results, { ts: 1 });
  assert.equal(records[0].k, "scenario"); assert.equal(records[0].p.tr, "super"); assert.equal(records[0].p.f, "fl"); assert.equal(records[1].nsfw, true);
});
test("crawlDeclarative pages until empty, runs every pass, dedupes by id", async () => {
  const page2 = { data: { nodes: [chubFx.data.nodes[0]] } }, empty = { data: { nodes: [] } };
  const impl = fakeFetch([
    { match: /page=1/, body: chubFx }, { match: /page=2/, body: page2 }, { match: /page=3/, body: empty },
  ]);
  const f = createFetcher({ fetchImpl: impl, minIntervalMs: 0 });
  const { records, errors, pagesFetched } = await crawlDeclarative(chub, f, { ts: 1, maxPages: 10 });
  assert.equal(errors.length, 0); assert.equal(records.length, 2); assert.equal(pagesFetched, 6);
});
test("crawlDeclarative isolates a failing pass and reports it", async () => {
  const impl = fakeFetch([{ match: /sort=download_count/, body: chubFx }, { match: /sort=created_at/, status: 500, body: "boom" }]);
  const f = createFetcher({ fetchImpl: impl, minIntervalMs: 0, retries: 0 });
  const { records, errors } = await crawlDeclarative(chub, f, { ts: 1, maxPages: 1 });
  assert.equal(records.length, 2); assert.equal(errors.length, 1); assert.match(errors[0].message, /HTTP 500/);
});
