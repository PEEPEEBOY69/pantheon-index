import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crawl, meta } from "../crawler/adapters/github-topics.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";
import { buildPngWithText } from "./helpers/png.mjs";
import { validateRecord } from "../crawler/lib/record.mjs";

const search = JSON.parse(fs.readFileSync("fixtures/gh-search.json", "utf8"));
const tree = JSON.parse(fs.readFileSync("fixtures/gh-tree.json", "utf8"));
const card = JSON.parse(fs.readFileSync("fixtures/card-v2.json", "utf8"));
const stwi = JSON.parse(fs.readFileSync("fixtures/stwi.json", "utf8"));
const png = buildPngWithText([["chara", Buffer.from(JSON.stringify(card)).toString("base64")]]);
const routes = [
  { match: "https://api.github.com/search/repositories?", body: search },
  { match: "https://api.github.com/repos/someone/cards/git/trees/main?recursive=1", body: tree },
  { match: "https://raw.githubusercontent.com/someone/cards/main/alice.png", body: png },
  { match: "https://raw.githubusercontent.com/someone/cards/main/lore/wi.json", body: stwi },
];
test("meta", () => { assert.deepEqual(meta.topics, ["character-cards", "character-card", "lorebook"]); });
test("crawl: topic search → trees → records; token header when GITHUB_TOKEN set", async () => {
  const impl = fakeFetch(routes);
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  const { records, errors } = await crawl(f, { ts: 3, token: "tok123", limits: { repos: 10, filesPerRepo: 100 } });
  assert.equal(errors.length, 0); assert.equal(records.length, 2);
  const c = records.find(r => r.k === "character");
  assert.equal(c.id, "github:character:someone/cards/alice.png"); assert.equal(c.o, "https://github.com/someone/cards/blob/main/alice.png"); assert.equal(c.p.u, "https://raw.githubusercontent.com/someone/cards/main/alice.png");
  assert.equal(impl.calls[0].opts.headers.authorization, "Bearer tok123");
  records.forEach(r => assert.equal(validateRecord(r).ok, true));
});
test("crawl without token sends no authorization header and still works", async () => {
  const impl = fakeFetch(routes); const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  await crawl(f, { ts: 3, token: undefined }); assert.equal("authorization" in impl.calls[0].opts.headers, false);
});
test("search failure for one topic is isolated", async () => {
  const impl = fakeFetch([{ match: /topic:character-cards/, body: search }, { match: /topic:character-card\b/, status: 403, body: "rate" }, { match: /topic:lorebook/, body: { items: [] } }, ...routes.slice(1)]);
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  const { records, errors } = await crawl(f, { ts: 3, token: undefined }); assert.equal(records.length, 2); assert.equal(errors.length, 1);
});
