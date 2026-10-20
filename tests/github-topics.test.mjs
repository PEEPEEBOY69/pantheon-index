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
test("meta: topics and free-text searches, because plenty of card repos never set a topic", () => {
  assert.ok(meta.topics.includes("character-cards") && meta.topics.includes("lorebook") && meta.topics.includes("sillytavern"));
  assert.ok(meta.topics.length >= 9 && meta.searches.length >= 4);
  assert.ok(meta.searches.every(s => /in:name,description/.test(s)), "searches are scoped, not a whole-index sweep");
});
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
  const impl = fakeFetch([{ match: /topic:character-cards/, body: search }, { match: /topic:character-card\b/, status: 403, body: "rate" }, { match: /search\/repositories/, body: { items: [] } }, ...routes.slice(1)]);
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl });
  const { records, errors } = await crawl(f, { ts: 3, token: undefined }); assert.equal(records.length, 2); assert.equal(errors.length, 1, "one refused query, one error, every other query still crawls");
});

// 2026-10-20: 127 of the 265 repos one night read were apps (SillyTavern forks, tools) whose PNGs are UI art and whose
// JSON is config; they took two thirds of the 6,000-file budget. Their likely-card files now come first, with every
// collection's, and their other files only get what budget is left. Nothing is skipped that budget allows.
test("crawl: an app's card-like folders and every collection come first; an app's other files only get the budget left", async () => {
  const cardPng = buildPngWithText([["chara", Buffer.from(JSON.stringify(card)).toString("base64")]]);
  const src = Array.from({ length: 40 }, (_, i) => ({ path: `src/m${i}.js`, type: "blob", size: 10 }));
  const appTree = { tree: [...src, { path: "public/img/logo.png", type: "blob", size: 100 }, { path: "locales/en.json", type: "blob", size: 100 }, { path: "default/characters/Seraphina.png", type: "blob", size: 100 }] };
  const collTree = { tree: [{ path: "alice.png", type: "blob", size: 100 }, { path: "bob.png", type: "blob", size: 100 }] };
  const searchBody = { items: [{ full_name: "dev/some-tavern-app", default_branch: "main", topics: ["sillytavern"] }, { full_name: "fan/cards", default_branch: "main", topics: ["character-cards"] }] };
  const impl = fakeFetch([
    { match: "https://api.github.com/search/repositories?", body: searchBody },
    { match: "https://api.github.com/repos/dev/some-tavern-app/git/trees/main", body: appTree },
    { match: "https://api.github.com/repos/fan/cards/git/trees/main", body: collTree },
    { match: "https://raw.githubusercontent.com/", body: cardPng },
  ]);
  const order = () => impl.calls.filter(c => c.url.startsWith("https://raw.githubusercontent.com/")).map(c => c.url.replace("https://raw.githubusercontent.com/", ""));
  await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl }), { ts: 1, token: "", limits: { files: 3 } });
  assert.deepEqual(order(), ["dev/some-tavern-app/main/default/characters/Seraphina.png", "fan/cards/main/alice.png", "fan/cards/main/bob.png"], "a 3-file budget goes to the likely cards, not the logo or the locale file");
  impl.calls.length = 0;
  await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl }), { ts: 1, token: "", limits: { files: 10 } });
  assert.deepEqual(order().slice(3).sort(), ["dev/some-tavern-app/main/locales/en.json", "dev/some-tavern-app/main/public/img/logo.png"], "with budget left, the app's other files are still read");
});
