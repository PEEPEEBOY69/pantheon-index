import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { crawl, meta, botSlugs, fileLinks, bookLinks, pageTitle } from "../crawler/adapters/bronya-rand.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs"; import { fakeFetch } from "./helpers/fake-fetch.mjs"; import { validateRecord } from "../crawler/lib/record.mjs";
const list = fs.readFileSync("fixtures/bronya-bot-list.html", "utf8"); const bot = fs.readFileSync("fixtures/bronya-bot.html", "utf8"); const books = fs.readFileSync("fixtures/bronya-books.html", "utf8");
const card = JSON.parse(fs.readFileSync("fixtures/card-v2.json", "utf8")); const stwi = JSON.parse(fs.readFileSync("fixtures/stwi.json", "utf8"));
test("html helpers", () => {
  assert.deepEqual(botSlugs(list), ["acheron", "blade"]); assert.equal(pageTitle(bot), "Acheron [Honkai: Star Rail]");
  const links = fileLinks(bot, meta.base + "acheron"); assert.equal(links.length, 3); assert.equal(links[0].href, "https://bronya-rand.github.io/reimagined-couscous/chars/%5BHSR%5D%20Acheron/Acheron.json"); assert.equal(links[1].ext, "png");
  assert.deepEqual(bookLinks(books, meta.base + "world-lore-books").map(l => l.text), ["Honkai: Star Rail", "Broken"]);
});
test("crawl: books → stwi lorebooks; bots → ccv2json characters with the matching PNG as cover; broken/missing files are skipped or errors, never a crash", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([
    { match: meta.base + "world-lore-books", body: books }, { match: meta.base + "world-info/HSR.json", body: stwi }, { match: meta.base + "world-info/Broken.json", body: { nope: 1 } },
    { match: meta.base + "bot-list", body: list }, { match: meta.base + "acheron", body: bot }, { match: meta.base + "blade", status: 500, body: "boom" },
    { match: meta.base + "chars/%5BHSR%5D%20Acheron/Acheron.json", body: card }, { match: meta.base + "chars/%5BHSR%5D%20Acheron/Acheron%20(no%20scenario).json", body: { spec: "other" } },
  ]) });
  const { records, errors } = await crawl(f, { ts: 7 });
  const lb = records.filter(r => r.k === "lorebook"); const ch = records.filter(r => r.k === "character");
  assert.equal(lb.length, 1); assert.equal(lb[0].n, "Honkai: Star Rail"); assert.equal(lb[0].p.f, "stwi"); assert.ok(lb[0].t.includes("world info"));
  assert.equal(ch.length, 1); assert.equal(ch[0].n, card.data.name); assert.equal(ch[0].c, "https://bronya-rand.github.io/reimagined-couscous/chars/%5BHSR%5D%20Acheron/Acheron.png"); assert.equal(ch[0].p.f, "ccv2json"); assert.equal(ch[0].o, meta.base + "acheron");
  assert.equal(errors.length, 1); assert.ok(errors[0].url.endsWith("/blade")); for (const r of records) assert.equal(validateRecord(r).ok, true, r.id);
});
