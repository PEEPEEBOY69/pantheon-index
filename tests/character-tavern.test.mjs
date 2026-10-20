// Character Tavern through its sitemap (2026-10-20): robots.txt disallows /api/ (the homepage sections the crawler used to
// read), so the list comes from the sitemap and each card's fields from its page's __data.json, both allowed.
import test from "node:test"; import assert from "node:assert/strict";
import { crawl, meta, cardUrl, coverUrl, parseSitemap, unflatten, dataRecord } from "../crawler/adapters/character-tavern.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://character-tavern.com/</loc></url>
<url><loc>https://character-tavern.com/author/0713</loc></url>
<url><loc>https://character-tavern.com/character/0713/xinba</loc><lastmod>2026-01-21T07:32:09.360Z</lastmod><image:image><image:loc>https://ct-cards.storage.character-tavern.com/0713/xinba.png?width=640</image:loc></image:image></url>
<url><loc>https://character-tavern.com/character/kinz/katy</loc><lastmod>2026-03-02T10:00:00.000Z</lastmod></url>
<url><loc>https://character-tavern.com/character/old/unchanged</loc><lastmod>2025-06-01T00:00:00.000Z</lastmod></url>
<url><loc>https://character-tavern.com/character/bad path/x</loc><lastmod>2025-06-01T00:00:00.000Z</lastmod></url>
</urlset>`;
// The page data as SvelteKit sends it: devalue's flat array (values point at other slots by index), then chunks.
function pageData({ name, path, tagline, isNSFW = false, updated, tokens, tags = [], warnings = [], author, lorebookId = null }) {
  const arr = [
    { character: 1, tags: 13, contentWarnings: 14 + tags.length, authorUsername: 15 + tags.length + warnings.length },
    { name: 2, path: 3, tagline: 4, description: 4, isNSFW: 5, createdAt: 6, lastUpdatedAt: 6, tokenTotal: 7, lorebookId: 8, visibility: 9, analytics_chats: 10, isOC: 11, versionId: 12 },
    name, path, tagline, isNSFW, updated, tokens, lorebookId, "public", 3, false, 1,
  ];
  arr.push(tags.map((_, i) => 14 + i)); for (const t of tags) arr.push(t);
  arr.push(warnings.map((_, i) => 15 + tags.length + i)); for (const w of warnings) arr.push(w);
  arr.push(author);
  return JSON.stringify({ type: "data", nodes: [{ type: "data", data: [{ user: 1 }, null] }, null, { type: "data", data: arr }] }) + "\n" + JSON.stringify({ type: "chunk", id: 1, data: [[]] }) + "\n";
}

test("parseSitemap: only character pages, their path, last change and cover; a bad path is skipped", () => {
  const rows = parseSitemap(SITEMAP);
  assert.deepEqual(rows.map(r => r.path), ["0713/xinba", "kinz/katy", "old/unchanged"]);
  assert.equal(rows[0].lastmod, Math.floor(Date.parse("2026-01-21T07:32:09.360Z") / 1000));
  assert.equal(parseSitemap("not xml at all").length, 0);
});

test("unflatten reads devalue's flat array: objects, arrays and plain values by index", () => {
  assert.deepEqual(unflatten([{ a: 1, b: 2 }, "x", [3, 4], 5, true]), { a: "x", b: [5, true] });
  assert.equal(unflatten([{ a: -1 }]).a, undefined, "negative slots are devalue's undefined");
});

test("dataRecord: the fields Pantheon shows, the creator credited, the PNG on its storage as the card", () => {
  const r = dataRecord(pageData({ name: "Katy", path: "kinz/katy", tagline: "Your partner identifies as a puppy.", updated: "2026-03-02T10:00:00.000Z", tokens: 367, tags: ["female", "romance"], warnings: ["Mature Themes"], author: "kinz", lorebookId: "lb1" }), { ts: 9 });
  assert.equal(r.n, "Katy"); assert.equal(r.b, "Your partner identifies as a puppy."); assert.equal(r.tok, 367);
  assert.equal(r.ts, Math.floor(Date.parse("2026-03-02T10:00:00.000Z") / 1000), "the card's own change date, not the crawl's");
  assert.deepEqual(r.t, ["female", "romance", "mature themes"]); assert.equal(r.cr, "kinz"); assert.equal(r.lb, true);
  assert.equal(r.o, "https://character-tavern.com/character/kinz/katy"); assert.equal(r.c, coverUrl("kinz/katy"));
  assert.deepEqual(r.p, { tr: "plain", u: cardUrl("kinz/katy"), f: "ccv2png" });
  assert.equal(validateRecord(r).ok, true);
  assert.equal(dataRecord(pageData({ name: "Spicy", path: "a/b", tagline: "x", isNSFW: true, updated: "2026-01-01T00:00:00Z", tokens: 1, author: "a" }), { ts: 1 }).nsfw, true);
  assert.equal(dataRecord("<html>a challenge page</html>", { ts: 1 }), null);
});

test("crawl: unchanged cards are kept without a request, changed and new ones read, the night's budget holds, nothing under /api/", async () => {
  const kept = dataRecord(pageData({ name: "Unchanged", path: "old/unchanged", tagline: "t", updated: "2025-06-01T00:00:00Z", tokens: 5, author: "old" }), { ts: 1 });
  const staleSections = { ...dataRecord(pageData({ name: "Xinba", path: "0713/xinba", tagline: "t", updated: "2026-01-21T07:32:09.360Z", tokens: 5, author: "0713" }), { ts: 1 }), t: ["trending"] };
  const impl = fakeFetch([
    { match: "https://character-tavern.com/sitemap.xml", body: SITEMAP, kind: "text" },
    { match: "https://character-tavern.com/character/0713/xinba/__data.json", body: pageData({ name: "Xinba", path: "0713/xinba", tagline: "快乐的小白", updated: "2026-01-21T07:32:09.360Z", tokens: 324, tags: ["宠物"], author: "0713" }), kind: "text" },
    { match: "https://character-tavern.com/character/kinz/katy/__data.json", body: pageData({ name: "Katy", path: "kinz/katy", tagline: "t", updated: "2026-03-02T10:00:00.000Z", tokens: 367, author: "kinz" }), kind: "text" },
  ]);
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  const { records, errors } = await crawl(f, { ts: 5, previous: [kept, staleSections] });
  assert.equal(errors.length, 0);
  assert.deepEqual(records.map(r => r.n).sort(), ["Katy", "Unchanged", "Xinba"]);
  assert.ok(!impl.calls.some(c => c.url.includes("old/unchanged")), "an unchanged card costs no request");
  assert.ok(impl.calls.some(c => c.url.includes("0713/xinba/__data.json")), "a record from the old sections route is read again for its full fields");
  assert.ok(impl.calls.every(c => !new URL(c.url).pathname.startsWith("/api/")));
  for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
  const budget = await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl }), { ts: 5, previous: [], limits: { dataPerNight: 1 } });
  assert.equal(budget.records.length, 1, "one read a night at this budget; the rest come on later nights");
  assert.equal(budget.records[0].n, "Katy", "the most recently changed first");
});

test("crawl: sitemap down → no records and an error, so the merge keeps what is held", async () => {
  const r = await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([]) }), { ts: 1, previous: [] });
  assert.equal(r.records.length, 0); assert.ok(r.errors.length >= 1);
  assert.equal(meta.id, "character-tavern"); assert.equal(meta.sitemapUrl, "https://character-tavern.com/sitemap.xml");
});
