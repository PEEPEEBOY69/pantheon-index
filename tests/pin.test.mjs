import test from "node:test"; import assert from "node:assert/strict";
import { pinManifest } from "../crawler/pin.mjs";
test("pin: the manifest gains the commit its files live at; anything but a full sha is refused", () => {
  const out = JSON.parse(pinManifest(JSON.stringify({ v: 1, hashes: { "sources.json": "ab" } }), "A".repeat(40)));
  assert.equal(out.commit, "a".repeat(40)); assert.equal(out.hashes["sources.json"], "ab", "nothing else changes");
  assert.throws(() => pinManifest("{}", "main"), /not a commit sha/);
  assert.throws(() => pinManifest("{}", ""), /not a commit sha/);
});
