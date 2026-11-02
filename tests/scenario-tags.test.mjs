// Richer tags for the Perchance RP scenarios (Pantheon spec 2026-11-02 §30). The source carries at most six, and spells
// some two ways. Pantheon folds the spellings and adds its own: a word list per tag over the title, blurb, setting and
// opening, a tag only when its words come up at least twice, the source's own tags first, twenty at most.
import test from "node:test"; import assert from "node:assert/strict";
import { enrichScenarioTags, SCENARIO_TAG_RULES } from "../crawler/lib/scenario-tags.mjs";

test("two spellings of one tag become one", () => {
  assert.deepEqual(enrichScenarioTags({ title: "T", tags: ["slice-of-life", "Slice of life", "romance-optional", "romance optional", "comedy"] }), ["slice of life", "romance optional", "comedy"]);
});

test("a tag is added for two different words of its list, or one three times, never on a stray word", () => {
  const ship = { title: "Last Light", blurb: "A starship adrift.", overview: "The starship drifts past a dead planet; aliens watch from the orbit.", intro: "Alarms.", tags: ["drama"] };
  const t = enrichScenarioTags(ship);
  assert.equal(t[0], "drama", "the source's own tags come first");
  assert.ok(t.includes("space")); assert.ok(t.includes("sci-fi"));
  assert.ok(!t.includes("horror"), "nothing about horror in it");
  const once = enrichScenarioTags({ title: "Tea Shop", overview: "A cozy shop. A ghost of a smile.", tags: [] });
  assert.ok(!once.includes("horror"), "one word is not enough");
  assert.ok(!enrichScenarioTags({ title: "Siege", overview: "The crown wants it. The crown pays.", tags: [] }).includes("politics"), "one word twice is not enough");
  assert.ok(enrichScenarioTags({ title: "Siege", overview: "The crown wants it. The crown pays. The crown waits.", tags: [] }).includes("politics"), "three times is");
});

test("whole words only, and never past twenty", () => {
  assert.ok(!enrichScenarioTags({ title: "x", overview: "The warden warned the warrior about the wardrobe.", tags: [] }).includes("war"), "war inside other words does not count");
  const many = { title: "Everything", overview: SCENARIO_TAG_RULES.map(([, words]) => words.slice(0, 2).join(" ")).join(". "), tags: Array.from({ length: 6 }, (_, i) => "own" + i) };
  const t = enrichScenarioTags(many);
  assert.equal(t.length, 20); assert.deepEqual(t.slice(0, 6), ["own0", "own1", "own2", "own3", "own4", "own5"]);
  assert.equal(new Set(t).size, t.length);
});
