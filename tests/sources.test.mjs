import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const sources = JSON.parse(fs.readFileSync("crawler/sources.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("crawler/targets.json", "utf8"));
const STATUS = ["candidate", "probed", "adapted", "live", "blocked", "dead"];

test("sources: unique ids, valid statuses, hosts lowercase, live ones have an existing adapter file", () => {
  const ids = new Set();
  for (const s of sources) {
    assert.match(s.id, /^[a-z0-9-]+$/); assert.equal(ids.has(s.id), false, "dup " + s.id); ids.add(s.id);
    assert.ok(STATUS.includes(s.status), s.id); assert.ok(Array.isArray(s.kinds) && s.kinds.length, s.id);
    for (const h of s.hosts) assert.equal(h, h.toLowerCase());
    if (s.status === "live") { assert.ok(s.adapter, s.id + " needs adapter"); assert.ok(fs.existsSync("crawler/adapters/" + s.adapter), s.adapter); }
    if (s.probe !== null && s.probe !== undefined) assert.match(s.probe, /^https:\/\//);
  }
  assert.ok(sources.length >= 35);
});
test("targets: https url containing {id} when receiver is expected later; kinds valid", () => {
  for (const t of targets) { assert.match(t.url, /^https:\/\/perchance\.org\//); assert.equal(typeof t.receiver, "boolean"); assert.ok(t.kinds.every(k => ["character", "lorebook", "scenario"].includes(k))); }
  assert.ok(targets.find(t => t.id === "blizzardui").url.includes("{id}"));
});
