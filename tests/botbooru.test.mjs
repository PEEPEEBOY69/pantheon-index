import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { crawl, meta, postRecord, tagNames } from "../crawler/adapters/botbooru.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";
const posts = JSON.parse(fs.readFileSync("fixtures/bb-posts.json", "utf8")); const books = JSON.parse(fs.readFileSync("fixtures/bb-lorebooks.json", "utf8"));
test("postRecord: tags flattened and de-underscored, sfw/nsfw auto tags become the flag, cover hotlinked, detail JSON over super-fetch", () => {
  const r = postRecord(posts.posts[0], 9); assert.equal(r.n, "Dr. Amanda Rose"); assert.deepEqual(r.t, ["female", "brown hair"]); assert.equal(r.nsfw, false); assert.equal(r.b, "The clinic never closes."); assert.equal(r.c, "https://botbooru.com/images/89db8dc1b31d4f219706a6686e90f44e.png"); assert.deepEqual(r.p, { tr: "super", u: "https://botbooru.com/post/77584", f: "bbjson" }); assert.equal(r.tok, 1540); assert.equal(r.o, "https://botbooru.com/character/77584");
  assert.equal(postRecord(posts.posts[1], 9).nsfw, true); assert.deepEqual(tagNames([{ name: "a_b" }, "c", null]), ["a b", "c"]);
});
test("crawl: pages the listing per pass until total, dedups, adds lorebooks; records validate; listing down → error", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: /botbooru\.com\/posts\/\?offset=0&/, body: posts }, { match: /botbooru\.com\/posts\/\?/, body: { total: 2, posts: [] } }, { match: "https://botbooru.com/api/lorebooks?offset=0", body: books }, { match: "https://botbooru.com/api/lorebooks?", body: { items: [], total: 1 } }]) });
  const { records, errors } = await crawl(f, { ts: 3 }); assert.equal(errors.length, 0); assert.equal(records.length, 3);
  const lb = records.find(r => r.k === "lorebook"); assert.equal(lb.n, "Fullmetal Alchemist"); assert.equal(lb.p.u, "https://botbooru.com/api/lorebooks/616"); assert.equal(lb.p.f, "bblore"); assert.equal(lb.tok, 9800); assert.equal(lb.o, "https://botbooru.com/lorebooks/yemhd");
  for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
  const down = await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([]) }), { ts: 1 }); assert.equal(down.records.length, 0); assert.ok(down.errors.length >= 1);
});
