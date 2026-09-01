import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { characterFromCard, lorebookFromStWi, lorebookFromChubNode, scenarioFromFictionLab, scenarioFromPerchanceRp, estimateTokens, detectFormat, isNsfwTags } from "../crawler/lib/normalise.mjs";

const card = JSON.parse(fs.readFileSync("fixtures/card-v2.json", "utf8"));
const stwi = JSON.parse(fs.readFileSync("fixtures/stwi.json", "utf8"));
const prp = JSON.parse(fs.readFileSync("fixtures/prp-sample.json", "utf8"));

test("characterFromCard: v2 → §5.1 shape with book", () => {
  const c = characterFromCard(card);
  assert.equal(c.name, "Alice"); assert.equal(c.first_mes, "Hello."); assert.deepEqual(c.alternate_greetings, ["Hey there."]);
  assert.deepEqual(c.tags, ["Fantasy", "Elf"]); assert.equal(c.creator, "cash");
  assert.equal(c.book.name, "Alice's world"); assert.deepEqual(c.book.entries[0].keys, ["Hollowbrook"]); assert.equal(c.book.entries[0].title, "Hollowbrook");
});
test("characterFromCard: v1 flat card and v3", () => {
  assert.equal(characterFromCard({ name: "Bob", description: "d", first_mes: "hi" }).name, "Bob");
  assert.equal(characterFromCard({ spec: "chara_card_v3", data: { name: "V3" } }).name, "V3");
  assert.equal(characterFromCard({ data: {} }), null); assert.equal(characterFromCard(null), null);
});
test("lorebookFromStWi: object-keyed entries, disable → enabled, comment → title", () => {
  const l = lorebookFromStWi(stwi);
  assert.equal(l.entries.length, 2); assert.equal(l.entries[0].title, "Dragons"); assert.equal(l.entries[0].enabled, true);
  assert.equal(l.entries[1].enabled, false); assert.equal(l.entries[1].constant, true); assert.deepEqual(l.entries[1].secondary_keys, ["blade"]);
});
test("lorebookFromChubNode: entries[] or JSON-string content", () => {
  const a = lorebookFromChubNode({ name: "L", entries: [{ keys: ["k"], content: "c", enabled: true }] });
  assert.equal(a.entries[0].keys[0], "k");
  const b = lorebookFromChubNode({ name: "L2", content: JSON.stringify({ entries: [{ keys: ["z"], content: "zz" }] }) });
  assert.equal(b.entries[0].keys[0], "z");
});
test("scenarioFromFictionLab: lorePieces → lore, backStory leads", () => {
  const s = scenarioFromFictionLab({ title: "T", description: "blurb", intro: "in", backStory: "bs", lorePieces: [{ title: "P", triggers: ["a"], content: "x" }], tags: ["t"] });
  assert.equal(s.title, "T"); assert.equal(s.lore.entries[0].constant, true); assert.equal(s.lore.entries[0].content, "bs"); assert.deepEqual(s.lore.entries[1].keys, ["a"]);
});
test("scenarioFromPerchanceRp maps measured keys", () => {
  const s = scenarioFromPerchanceRp(prp[0]);
  assert.equal(s.title, "Every Trick Works Once"); assert.equal(s.blurb, "It hunts the town one night a month."); assert.equal(s.starters.length, 2); assert.equal(s.cover, prp[0].cardImage); assert.equal(s.lore, null);
});
test("isNsfwTags", () => { assert.equal(isNsfwTags(["romance", "NSFW"]), true); assert.equal(isNsfwTags(["dread"]), false); });
test("estimateTokens ≈ chars/4 over all text fields", () => {
  const c = characterFromCard(card); const n = estimateTokens(c); assert.ok(n > 10 && n < 200);
});
test("detectFormat", () => {
  assert.equal(detectFormat(card), "ccv2json"); assert.equal(detectFormat({ spec: "chara_card_v3", data: {} }), "ccv3json");
  assert.equal(detectFormat(stwi), "stwi"); assert.equal(detectFormat({ name: "x", first_mes: "y" }), "ccv2json"); assert.equal(detectFormat({ a: 1 }), null);
});
