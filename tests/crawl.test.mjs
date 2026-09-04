import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCrawl } from "../crawler/crawl.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { buildPngWithText } from "./helpers/png.mjs";
import { validateRecord } from "../crawler/lib/record.mjs";

const read = f => JSON.parse(fs.readFileSync(f, "utf8"));
const chubFx = read("fixtures/chub-search.json"), prp = read("fixtures/prp-sample.json"), card = read("fixtures/card-v2.json");
const png = buildPngWithText([["chara", Buffer.from(JSON.stringify(card)).toString("base64")]]);
const empty = { data: { nodes: [] } };
function fetcher(overrides = []) {
  return createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([
    ...overrides,
    { match: /api\.chub\.ai\/search\?.*namespace=characters.*page=1/, body: chubFx }, { match: /api\.chub\.ai\/search\?.*namespace=characters/, body: empty },
    { match: /api\.chub\.ai\/search\?.*namespace=lorebooks.*page=1/, body: read("fixtures/chub-lorebooks.json") }, { match: /api\.chub\.ai\/search\?.*namespace=lorebooks/, body: empty },
    { match: /fictionlab\.ai\/api\/search\?.*page=0/, body: read("fixtures/fictionlab-search.json") }, { match: /fictionlab\.ai\/api\/search/, body: { results: [] } },
    { match: "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json", body: prp },
    { match: "https://huggingface.co/api/datasets?", body: read("fixtures/hf-datasets.json") },
    { match: "https://huggingface.co/api/datasets/someone/tavern-cards/tree/main", body: read("fixtures/hf-tree.json") }, { match: "https://huggingface.co/api/datasets/other/lorebooks/tree/main", body: [] },
    { match: "https://huggingface.co/datasets/someone/tavern-cards/resolve/main/cards/alice.png", body: png }, { match: "https://huggingface.co/datasets/someone/tavern-cards/resolve/main/wi/dragons.json", body: read("fixtures/stwi.json") },
    { match: "https://api.github.com/search/repositories?", body: read("fixtures/gh-search.json") },
    { match: "https://api.github.com/repos/someone/cards/git/trees/main?recursive=1", body: read("fixtures/gh-tree.json") },
    { match: "https://raw.githubusercontent.com/someone/cards/main/alice.png", body: png }, { match: "https://raw.githubusercontent.com/someone/cards/main/lore/wi.json", body: read("fixtures/stwi.json") },
    { match: "https://character-tavern.com/api/homepage/sections", body: read("fixtures/ct-sections.json") },
    { match: "https://api.aicharactercards.com/api/cards?page=1", body: read("fixtures/aicc-cards.json") }, { match: "https://api.aicharactercards.com/api/cards?", body: { data: [], pagination: { total: 3 } } },
    { match: "https://api.aicharactercards.com/uploads/", body: png },
    { match: "https://bronya-rand.github.io/reimagined-couscous/world-lore-books", body: fs.readFileSync("fixtures/bronya-books.html", "utf8"), kind: "text" },
    { match: "https://bronya-rand.github.io/reimagined-couscous/world-info/HSR.json", body: read("fixtures/stwi.json") }, { match: "https://bronya-rand.github.io/reimagined-couscous/world-info/Broken.json", body: { nope: 1 } },
    { match: "https://bronya-rand.github.io/reimagined-couscous/bot-list", body: fs.readFileSync("fixtures/bronya-bot-list.html", "utf8"), kind: "text" },
    { match: "https://bronya-rand.github.io/reimagined-couscous/acheron", body: fs.readFileSync("fixtures/bronya-bot.html", "utf8"), kind: "text" }, { match: "https://bronya-rand.github.io/reimagined-couscous/blade", body: "<html><h1>Blade</h1></html>", kind: "text" },
    { match: "https://bronya-rand.github.io/reimagined-couscous/chars/%5BHSR%5D%20Acheron/Acheron.json", body: card }, { match: "https://bronya-rand.github.io/reimagined-couscous/chars/%5BHSR%5D%20Acheron/Acheron%20(no%20scenario).json", body: { spec: "other" } },
    { match: /sv\.risuai\.xyz\/realm\/.*page%3D%3D0.*nsfw%3D%3Dfalse.*sort%3D%3Ddownloads/, body: read("fixtures/realm-list.json") }, { match: "https://sv.risuai.xyz/realm/", body: { cards: [] } },
    { match: /botbooru\.com\/posts\/\?offset=0&/, body: read("fixtures/bb-posts.json") }, { match: "https://botbooru.com/posts/?", body: { total: 2, posts: [] } }, { match: "https://botbooru.com/api/lorebooks?offset=0", body: read("fixtures/bb-lorebooks.json") }, { match: "https://botbooru.com/api/lorebooks?", body: { items: [], total: 1 } },
    { match: "https://rentry.org/", body: fs.readFileSync("fixtures/rentry-raw.txt", "utf8"), kind: "text" }, { match: "https://blocky-mint.github.io/", body: "<a href='https://chub.ai/'>x</a>", kind: "text" },
    { match: /^https:\/\//, body: "<html>ok</html>", kind: "text", headers: { "access-control-allow-origin": "*" } },
  ]) });
}

test("runCrawl writes a complete index from fixtures", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-index-"));
  const result = await runCrawl({ outDir: out, fetcher: fetcher(), now: 1_700_000_000, limits: { huggingface: { datasets: 5, filesPerDataset: 20 }, github: { repos: 5, filesPerRepo: 20 } }, log: () => {} });
  const m = read(path.join(out, "manifest.json"));
  assert.equal(m.v, 1); assert.equal(m.builtAt, 1_700_000_000);
  assert.deepEqual(Object.keys(m.sources).sort(), ["aicharactercards", "botbooru", "bronya-rand", "character-tavern", "chub", "chub-lorebooks", "github", "huggingface", "perchance-rp", "risu-realm"], "fictionlab is crawl:false");
  assert.equal(m.sources["character-tavern"].count, 3); assert.equal(m.sources.aicharactercards.count, 3); assert.equal(m.sources["bronya-rand"].count, 2); assert.equal(m.sources["risu-realm"].count, 2); assert.equal(m.sources.botbooru.count, 3);
  assert.equal(m.sources.chub.count, 2); assert.equal(m.sources["perchance-rp"].count, 2); assert.equal(m.sources.huggingface.count, 2);
  for (const [, s] of Object.entries(m.sources)) for (const f of [...s.heads, ...s.recs]) { assert.ok(fs.existsSync(path.join(out, f)), f); assert.ok(m.hashes[f]); }
  const adapters = read(path.join(out, "adapters.json")); assert.ok(adapters.find(a => a.id === "chub").search); assert.ok(adapters.find(a => a.id === "perchance-rp").caps);
  assert.ok(adapters.find(a => a.id === "fictionlab").search, "crawl:false adapters still ship to the plugin");
  const sources = read(path.join(out, "sources.json")); const chub = sources.find(s => s.id === "chub"); assert.equal(chub.sweep.kind, "json"); assert.equal(chub.lastCrawl.ok, true); assert.equal(chub.lastCrawl.count, 2);
  assert.ok(sources.find(s => s.id === "jannyai").sweep.at); assert.ok(sources.some(s => s.status === "candidate" && s.discoveredFrom), "aggregator candidates appended");
  assert.ok(fs.existsSync(path.join(out, "targets.json")));
  for (const s of Object.keys(m.sources)) for (const f of m.sources[s].recs) read(path.join(out, f)).forEach(r => assert.equal(validateRecord(r).ok, true));
  assert.equal(result.errors.length, 0);
});
test("runCrawl: one adapter failing keeps the previous shards for that source and reports it", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-index-"));
  await runCrawl({ outDir: out, fetcher: fetcher(), now: 1_700_000_000, limits: { huggingface: { datasets: 1, filesPerDataset: 5 }, github: { repos: 1, filesPerRepo: 5 } }, log: () => {} });
  const broken = fetcher([{ match: "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json", status: 500, body: "x", kind: "text" }]);
  const r2 = await runCrawl({ outDir: out, fetcher: broken, now: 1_700_086_400, limits: { huggingface: { datasets: 1, filesPerDataset: 5 }, github: { repos: 1, filesPerRepo: 5 } }, log: () => {} });
  const m = read(path.join(out, "manifest.json")); assert.equal(m.sources["perchance-rp"].count, 2, "previous kept");
  const src = read(path.join(out, "sources.json")).find(s => s.id === "perchance-rp"); assert.equal(src.lastCrawl.ok, false); assert.match(src.lastCrawl.error, /HTTP 500/);
  assert.ok(r2.errors.some(e => e.source === "perchance-rp"));
});
test("runCrawl writes tags.json: per-kind facets over every record in the index, hashed in the manifest and pointed at by tagsUrl", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-index-"));
  const { manifest } = await runCrawl({ outDir: out, fetcher: fetcher(), now: 1_700_000_000, limits: { huggingface: { datasets: 1, filesPerDataset: 5 }, github: { repos: 1, filesPerRepo: 5 } }, log: () => {} });
  assert.equal(manifest.tagsUrl, "tags.json");
  const tags = read(path.join(out, "tags.json"));
  assert.deepEqual(Object.keys(tags).sort(), ["character", "lorebook", "scenario"]);
  for (const rows of Object.values(tags)) for (const row of rows) { assert.equal(typeof row[0], "string"); assert.equal(typeof row[1], "number"); assert.ok(row[1] >= 2, "a facet needs more than one record"); assert.ok(row.length === 2 || typeof row[2] === "string"); }
  assert.ok(manifest.hashes["tags.json"], "hashed like every other file, so a rebuilt vocabulary invalidates the cached one");
});

test("runCrawl --only re-crawls the named sources and keeps every other source's previous records and manifest entry", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-index-"));
  await runCrawl({ outDir: out, fetcher: fetcher(), now: 1_700_000_000, limits: { huggingface: { datasets: 1, filesPerDataset: 5 }, github: { repos: 1, filesPerRepo: 5 } }, log: () => {} });
  const before = read(path.join(out, "manifest.json"));
  const broken = fetcher([{ match: "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json", status: 500, body: "x", kind: "text" }]);
  const r = await runCrawl({ outDir: out, fetcher: broken, now: 1_700_086_400, only: ["botbooru"], limits: { huggingface: { datasets: 1, filesPerDataset: 5 }, github: { repos: 1, filesPerRepo: 5 } }, log: () => {} });
  const after = read(path.join(out, "manifest.json"));
  assert.deepEqual(Object.keys(after.sources).sort(), Object.keys(before.sources).sort()); assert.equal(after.sources["perchance-rp"].count, before.sources["perchance-rp"].count, "not crawled, not broken: kept");
  assert.equal(r.errors.length, 0, "the broken source was not touched"); assert.equal(after.sources.botbooru.count, 3);
  const adapters = read(path.join(out, "adapters.json")); assert.ok(adapters.find(a => a.id === "chub"), "adapters still exported for kept sources");
});
