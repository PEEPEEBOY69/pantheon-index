import test from "node:test"; import assert from "node:assert/strict";
import { buildTagFacets, foldTag } from "../crawler/lib/tags.mjs";
test("foldTag: case, underscores, hyphens and stray punctuation collapse to one spelling; + & ' survive", () => {
  assert.equal(foldTag("Slice-of-Life"), "slice of life"); assert.equal(foldTag("slice_of_life"), "slice of life"); assert.equal(foldTag("  Slice   of Life "), "slice of life");
  assert.equal(foldTag("sfw <-> nsfw"), "sfw nsfw"); assert.equal(foldTag("18+"), "18+"); assert.equal(foldTag("rock & roll"), "rock & roll"); assert.equal(foldTag("don't"), "don't");
  assert.equal(foldTag(null), ""); assert.equal(foldTag(42), "42");
});
test("buildTagFacets: counts per kind, merges spellings, keeps the commonest label, drops junk and one-offs, caps per kind, sorts by count", () => {
  const recs = [];
  for (let i = 0; i < 5; i++) recs.push({ k: "character", t: ["Slice-of-Life", "romance", "root", "oc"] });
  for (let i = 0; i < 3; i++) recs.push({ k: "character", t: ["slice of life", "ROMANCE"] });
  recs.push({ k: "character", t: ["once-only"] });
  recs.push({ k: "character", t: ["dup", "dup", "Dup"] });
  for (let i = 0; i < 4; i++) recs.push({ k: "lorebook", t: ["rpg", "game characters"] });
  for (let i = 0; i < 2; i++) recs.push({ k: "scenario", t: ["found family"] });
  const f = buildTagFacets(recs, { perKind: 2 });
  assert.deepEqual(f.character, [["romance", 8], ["slice of life", 8, "Slice-of-Life"]], "merged, commonest spelling kept when it differs from the fold, ties broken alphabetically, capped at 2");
  assert.ok(!JSON.stringify(f.character).includes("once-only"), "a tag on one record is not a facet");
  assert.ok(!JSON.stringify(f.character).includes("root") && !JSON.stringify(f.character).includes("oc"), "junk vocabulary dropped");
  assert.deepEqual(f.lorebook.map(r => r[0]).sort(), ["game characters", "rpg"]);
  assert.deepEqual(f.scenario, [["found family", 2]]);
  const dup = buildTagFacets([{ k: "character", t: ["dup", "dup"] }, { k: "character", t: ["dup"] }], { perKind: 5 });
  assert.deepEqual(dup.character, [["dup", 2]], "the same tag twice on one record counts once");
  assert.deepEqual(buildTagFacets([], {}), { character: [], lorebook: [], scenario: [] });
});
