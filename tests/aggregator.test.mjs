import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractHosts, discover, SOURCES } from "../crawler/lib/aggregator.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";

const raw = fs.readFileSync("fixtures/rentry-raw.txt", "utf8");
test("extractHosts: unique registrable hosts, www stripped, non-http ignored", () => {
  assert.deepEqual(extractHosts(raw), ["chub.ai", "character-tavern.com", "botbooru.com", "newsite.gg"]);
  assert.deepEqual(extractHosts("https://cdn.jsdelivr.net/x https://blocky-mint.github.io/ https://t.co/abc https://newsite.gg/"), ["newsite.gg"]);
});
test("discover: returns hosts not already in the registry, with provenance", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch(SOURCES.map(s => ({ match: s.url, body: raw, kind: "text" }))) });
  const registry = [{ id: "chub", hosts: ["chub.ai"] }, { id: "character-tavern", hosts: ["character-tavern.com"] }, { id: "botbooru", hosts: ["botbooru.com"] }];
  const { candidates, errors } = await discover(f, registry, { ts: 7 });
  assert.equal(errors.length, 0);
  assert.deepEqual(candidates.map(c => c.host), ["newsite.gg"]);
  assert.equal(candidates[0].discoveredFrom[0], SOURCES[0].id); assert.equal(candidates[0].ts, 7);
});
test("discover: a failing aggregator is isolated", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: SOURCES[0].url, body: raw, kind: "text" }]) });
  const { candidates, errors } = await discover(f, [], { ts: 1 }); assert.ok(candidates.length > 0); assert.equal(errors.length, SOURCES.length - 1);
});
