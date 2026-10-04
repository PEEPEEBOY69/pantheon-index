import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crawl, meta, tagsOf } from "../crawler/adapters/perchance-db.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { validateRecord, toHead } from "../crawler/lib/record.mjs";

const sample = JSON.parse(fs.readFileSync("fixtures/perchance-db-sample.json", "utf8"));

test("meta names the source, its licence and its index file", () => {
  assert.equal(meta.id, "perchance-db");
  assert.deepEqual(meta.kinds, ["character"]);
  assert.equal(meta.license, "CC BY-SA 4.0");
  assert.match(meta.indexUrl, /^https:\/\/raw\.githubusercontent\.com\/nosfertm\/perchance-character-database\/main\/ai-character-chat\/characters\/index\.json$/);
});

test("tags come from the categories, the rating left to the nsfw flag", () => {
  assert.deepEqual(tagsOf({ rating: "sfw", genre: ["Romance"], species: ["Human"], gender: ["Male"], role: ["Bard"], personality: ["Shy"], source: ["Perchance"] }), ["Romance", "Human", "Male", "Bard", "Shy", "Perchance"]);
  assert.deepEqual(tagsOf(null), []);
});

test("crawl makes credited, linked character records with the official chat's export as the payload", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: meta.indexUrl, body: sample }]), minIntervalMs: 0 });
  const { records, errors } = await crawl(f, { ts: 7 });
  assert.equal(errors.length, 0);
  assert.equal(records.length, 2, "the row with no name and no file is skipped");
  const ike = records[0];
  assert.equal(ike.id, "perchance-db:character:sfw/Ike_by_Perchance");
  assert.equal(ike.cr, "Perchance", "the author is credited");
  assert.equal(ike.o, "https://github.com/nosfertm/perchance-character-database/tree/main/ai-character-chat/characters/sfw/Ike%20by%20Perchance");
  assert.equal(ike.p.f, "dexiegz");
  assert.equal(ike.p.tr, "plain");
  assert.equal(ike.p.u, "https://raw.githubusercontent.com/nosfertm/perchance-character-database/main/ai-character-chat/characters/sfw/Ike%20by%20Perchance/character.gz");
  assert.deepEqual(ike.t, ["romance", "slice of life", "human", "male", "best friend", "friendly", "playful", "perchance"]);
  assert.equal(ike.nsfw, false);
  assert.equal(ike.caps.i, true);
  const velvet = records[1];
  assert.equal(velvet.nsfw, true);
  assert.equal(velvet.c, null, "an http cover is dropped");
  records.forEach((r) => assert.equal(validateRecord(r).ok, true, JSON.stringify(validateRecord(r))));
  assert.ok(!("cr" in toHead(ike)), "heads stay the size they were");
});

test("a record without a creator carries no cr, and a long one is cut", async () => {
  const { makeRecord } = await import("../crawler/lib/record.mjs");
  const base = { src: "x", k: "character", nid: "1", n: "A", o: "https://e.x/1", ts: 1 };
  assert.ok(!("cr" in makeRecord(base)));
  assert.equal(makeRecord({ ...base, cr: "y".repeat(90) }).cr.length, 60);
  assert.equal(validateRecord({ ...makeRecord(base), cr: 5 }).ok, false);
});

test("crawl: an index that is not an array is one error, no records", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: meta.indexUrl, body: { nope: 1 } }]), minIntervalMs: 0 });
  const { records, errors } = await crawl(f, { ts: 1 });
  assert.equal(records.length, 0);
  assert.equal(errors.length, 1);
});
