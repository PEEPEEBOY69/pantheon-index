import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shardRecords, writeSourceShards, MAX_SHARD_BYTES } from "../crawler/lib/shard.mjs";
import { toHead } from "../crawler/lib/record.mjs";
const rec = (i, nsfw = false) => ({ id: `s:character:${String(i).padStart(6, "0")}`, k: "character", src: "s", n: "Name " + i, b: "blurb ".repeat(40), t: ["a"], c: "https://c/" + i, nsfw, o: "https://o/" + i, p: { tr: "plain", u: "https://u/" + i, f: "ccv2png" }, caps: { s: "index", i: true, o: true }, tok: 100, ts: 1 });

test("shardRecords splits so every shard serialises ≤ maxBytes and preserves order", () => {
  const recs = Array.from({ length: 500 }, (_, i) => rec(i));
  const shards = shardRecords(recs, { maxBytes: 20000 });
  assert.ok(shards.length > 1);
  for (const s of shards) assert.ok(Buffer.byteLength(JSON.stringify(s)) <= 20000);
  assert.deepEqual(shards.flat().map(r => r.id), recs.map(r => r.id));
});
test("writeSourceShards writes head-NNN / rec-NNN, applies nsfw guard, returns hashes and counts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-"));
  const recs = [rec(1), rec(2, true)];
  const out = await writeSourceShards(dir, "s", recs, { maxBytes: MAX_SHARD_BYTES });
  assert.deepEqual(out.heads, ["s/head-000.json"]); assert.deepEqual(out.recs, ["s/rec-000.json"]); assert.equal(out.count, 2);
  const head = JSON.parse(fs.readFileSync(path.join(dir, "s/head-000.json"), "utf8"));
  assert.deepEqual(head[0], toHead(recs[0])); assert.equal("b" in head[0], false);
  const full = JSON.parse(fs.readFileSync(path.join(dir, "s/rec-000.json"), "utf8"));
  assert.equal(full[1].b, null); assert.equal(full[0].b.length > 0, true);
  assert.match(out.hashes["s/rec-000.json"], /^[0-9a-f]{64}$/); assert.ok(out.bytes > 0);
});
test("writeSourceShards removes stale shard files from a previous larger run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-"));
  fs.mkdirSync(path.join(dir, "s")); fs.writeFileSync(path.join(dir, "s/rec-007.json"), "[]"); fs.writeFileSync(path.join(dir, "s/head-007.json"), "[]");
  await writeSourceShards(dir, "s", [rec(1)], { maxBytes: MAX_SHARD_BYTES });
  assert.deepEqual(fs.readdirSync(path.join(dir, "s")).sort(), ["head-000.json", "rec-000.json"]);
});
