import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crawl, meta } from "../crawler/adapters/huggingface.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { buildPngWithText } from "./helpers/png.mjs";
import { validateRecord } from "../crawler/lib/record.mjs";

const datasets = JSON.parse(fs.readFileSync("fixtures/hf-datasets.json", "utf8"));
const tree = JSON.parse(fs.readFileSync("fixtures/hf-tree.json", "utf8"));
const card = JSON.parse(fs.readFileSync("fixtures/card-v2.json", "utf8"));
const stwi = JSON.parse(fs.readFileSync("fixtures/stwi.json", "utf8"));
const png = buildPngWithText([["chara", Buffer.from(JSON.stringify(card)).toString("base64")]]);

function fetcherFor() {
  return createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([
    { match: "https://huggingface.co/api/datasets?", body: datasets },
    { match: "https://huggingface.co/api/datasets/someone/tavern-cards/tree/main", body: tree },
    { match: "https://huggingface.co/api/datasets/other/lorebooks/tree/main", body: [{ type: "file", path: "wi.json", size: 500 }] },
    { match: "https://huggingface.co/datasets/someone/tavern-cards/resolve/main/cards/alice.png", body: png },
    { match: "https://huggingface.co/datasets/someone/tavern-cards/resolve/main/wi/dragons.json", body: stwi },
    { match: "https://huggingface.co/datasets/other/lorebooks/resolve/main/wi.json", body: { junk: true } },
  ]) });
}
test("meta", () => { assert.equal(meta.id, "huggingface"); assert.deepEqual(meta.kinds, ["character", "lorebook"]); });
test("crawl: datasets → trees → cards; skips oversize, non-card files, unparseable json", async () => {
  const { records, errors } = await crawl(fetcherFor(), { ts: 9, limits: { datasets: 10, filesPerDataset: 50 } });
  assert.equal(errors.length, 0); assert.equal(records.length, 2);
  const c = records.find(r => r.k === "character"), l = records.find(r => r.k === "lorebook");
  assert.equal(c.id, "huggingface:character:someone/tavern-cards/cards/alice.png"); assert.equal(c.n, "Alice"); assert.equal(c.p.f, "ccv2png"); assert.equal(c.p.tr, "plain");
  assert.equal(c.p.u, "https://huggingface.co/datasets/someone/tavern-cards/resolve/main/cards/alice.png"); assert.equal(c.o, "https://huggingface.co/datasets/someone/tavern-cards/blob/main/cards/alice.png");
  assert.equal(l.n, "World Info"); assert.equal(l.p.f, "stwi");
  records.forEach(r => assert.equal(validateRecord(r).ok, true));
});
test("crawl respects limits.datasets", async () => {
  const { records } = await crawl(fetcherFor(), { ts: 9, limits: { datasets: 1, filesPerDataset: 50 } });
  assert.equal(records.length, 2);
});
test("a dataset whose tree 404s is isolated into errors", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: "https://huggingface.co/api/datasets?", body: datasets }]) });
  const { records, errors } = await crawl(f, { ts: 9 }); assert.equal(records.length, 0); assert.equal(errors.length, 2);
});
