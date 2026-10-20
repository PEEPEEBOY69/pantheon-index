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

// 2026-10-20: the searches find ~1,006 repos and the crawl reads 320 at most, in search order, so a big "roleplay"
// topic full of games and apps came before the card collections. Repos are ranked first: card-like names, descriptions
// and topics lead, stars break ties, forks fall back.
test("repoScore ranks card collections ahead of games and apps, and the crawl visits in that order", async () => {
  const { repoScore } = await import("../crawler/adapters/github-topics.mjs");
  const game = { full_name: "x/rpg-engine", name: "rpg-engine", description: "A roleplay game engine", topics: ["roleplay"], stargazers_count: 900 };
  const coll = { full_name: "y/my-character-cards", name: "my-character-cards", description: "SillyTavern character cards", topics: [], stargazers_count: 2 };
  const fork = { ...coll, full_name: "z/my-character-cards", fork: true };
  assert.ok(repoScore(coll) > repoScore(game), "a card collection outranks a popular game");
  assert.ok(repoScore(coll) > repoScore(fork), "a fork falls back");
  const impl = fakeFetch([
    { match: "https://api.github.com/search/repositories?", body: { items: [{ ...game, default_branch: "main" }, { ...coll, default_branch: "main" }] } },
    { match: "https://api.github.com/repos/", body: { tree: [] } },
  ]);
  await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl }), { ts: 1, token: "", limits: { repos: 1 } });
  const trees = impl.calls.filter(c => c.url.includes("/git/trees/")).map(c => c.url.split("/repos/")[1].split("/git")[0]);
  assert.deepEqual(trees, ["y/my-character-cards"], "with room for one repo, the collection is the one read");
});

// 2026-10-20: 7% of GitHub cards had a cover. A card kept as JSON has no picture of its own, but repos usually keep its
// portrait beside it under the same name; the tree is already read, so that image becomes the cover.
test("a JSON card takes the image beside it with the same name as its cover", async () => {
  const collTree = { tree: [{ path: "chars/alice.json", type: "blob", size: 900 }, { path: "chars/alice.png", type: "blob", size: 50000 }, { path: "chars/bob.json", type: "blob", size: 900 }, { path: "chars/huge.json", type: "blob", size: 900 }, { path: "chars/huge.webp", type: "blob", size: 5000000 }] };
  const impl = fakeFetch([
    { match: "https://api.github.com/search/repositories?", body: { items: [{ full_name: "fan/cards", name: "cards", default_branch: "main", topics: ["character-cards"] }] } },
    { match: "https://api.github.com/repos/fan/cards/git/trees/main", body: collTree },
    { match: "https://raw.githubusercontent.com/fan/cards/main/chars/alice.png", body: new Uint8Array([1, 2, 3]) },
    { match: "https://raw.githubusercontent.com/fan/cards/main/chars/", body: card },
  ]);
  const { records } = await crawl(createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: impl }), { ts: 1, token: "" });
  const byFile = f => records.find(r => r.id.endsWith(f));
  assert.equal(byFile("chars/alice.json").c, "https://raw.githubusercontent.com/fan/cards/main/chars/alice.png");
  assert.equal(byFile("chars/bob.json").c, card.data && card.data.avatar ? byFile("chars/bob.json").c : null, "no image beside it, no cover");
  assert.equal(byFile("chars/huge.json").c, null, "an image too big for a tile is not used");
});
