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
    { match: "https://rentry.org/", body: fs.readFileSync("fixtures/rentry-raw.txt", "utf8"), kind: "text" }, { match: "https://blocky-mint.github.io/", body: "<a href='https://chub.ai/'>x</a>", kind: "text" },
    { match: /^https:\/\//, body: "<html>ok</html>", kind: "text", headers: { "access-control-allow-origin": "*" } },
  ]) });
}

test("runCrawl writes a complete index from fixtures", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-index-"));
  const result = await runCrawl({ outDir: out, fetcher: fetcher(), now: 1_700_000_000, limits: { huggingface: { datasets: 5, filesPerDataset: 20 }, github: { repos: 5, filesPerRepo: 20 } }, log: () => {} });
  const m = read(path.join(out, "manifest.json"));
  assert.equal(m.v, 1); assert.equal(m.builtAt, 1_700_000_000);
  assert.deepEqual(Object.keys(m.sources).sort(), ["chub", "chub-lorebooks", "github", "huggingface", "perchance-rp"], "fictionlab is crawl:false");
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
