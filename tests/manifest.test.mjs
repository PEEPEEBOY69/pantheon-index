import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../crawler/lib/manifest.mjs";
test("buildManifest shape", () => {
  const m = buildManifest({ builtAt: 123, sources: { chub: { count: 2, heads: ["chub/head-000.json"], recs: ["chub/rec-000.json"], bytes: 10, hashes: { "chub/rec-000.json": "ab" } } }, hashes: { "adapters.json": "cd" } });
  assert.equal(m.v, 1); assert.equal(m.builtAt, 123); assert.equal(m.sources.chub.count, 2);
  assert.equal(m.adaptersUrl, "adapters.json"); assert.equal(m.sourcesUrl, "sources.json"); assert.equal(m.targetsUrl, "targets.json");
  assert.equal(m.hashes["chub/rec-000.json"], "ab"); assert.equal(m.hashes["adapters.json"], "cd");
  assert.equal(m.base.primary, "https://cdn.jsdelivr.net/gh/PEEPEEBOY69/pantheon-index@main/index/");
});
