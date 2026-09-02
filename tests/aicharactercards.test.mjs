import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { crawl, meta, stripHtml, fileUrlFromImage } from "../crawler/adapters/aicharactercards.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { buildPngWithText } from "./helpers/png.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";
const page = JSON.parse(fs.readFileSync("fixtures/aicc-cards.json", "utf8")); const card = JSON.parse(fs.readFileSync("fixtures/card-v2.json", "utf8"));
const png = buildPngWithText([["chara", Buffer.from(JSON.stringify(card)).toString("base64")]]);
test("helpers", () => { assert.equal(stripHtml("<p>This &amp; that</p>"), "This & that"); assert.equal(fileUrlFromImage("/uploads/x/a-opt.webp"), meta.host + "/uploads/x/a.png"); assert.equal(fileUrlFromImage("/uploads/x/a.jpg"), null); assert.equal(fileUrlFromImage(null), null); });
test("crawl: pages until total; derived PNG verified once → import-capable records; tags flattened; html stripped; no image → link-only", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: meta.api + "?page=1", body: page }, { match: meta.api + "?page=2", body: { data: [], pagination: { total: 3 } } }, { match: meta.host + "/uploads/character_cards/59990/pipabeth-x-reader.png", body: png }]) });
  const { records, errors } = await crawl(f, { ts: 3 }); assert.equal(errors.length, 0); assert.equal(records.length, 3);
  const a = records.find(r => r.id.endsWith(":2369")); assert.equal(a.b, "This roleplay features & demigods."); assert.deepEqual(a.t, ["love"]); assert.equal(a.p.f, "ccv2png"); assert.equal(a.p.tr, "plain"); assert.equal(a.caps.i, true); assert.equal(a.c, meta.host + "/uploads/character_cards/59990/pipabeth-x-reader-opt.webp"); assert.equal(a.o, "https://aicharactercards.com/cards/2369"); assert.equal(a.tok, 1900);
  const b = records.find(r => r.id.endsWith(":2304")); assert.equal(b.nsfw, true); assert.equal(b.b, "A rugged mercenary."); assert.deepEqual(b.t, ["adventure/rpg", "fantasy"]);
  const c = records.find(r => r.id.endsWith(":9")); assert.equal(c.p.u, null); assert.equal(c.caps.i, false); assert.equal(c.c, null);
  for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
});
test("crawl: when the derived PNG carries no card, every record is link-only", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: meta.api + "?page=1", body: page }, { match: meta.host + "/uploads/", body: buildPngWithText([]) }]) });
  const { records } = await crawl(f, { ts: 3 }); assert.ok(records.every(r => r.caps.i === false && r.p.u === null));
});
