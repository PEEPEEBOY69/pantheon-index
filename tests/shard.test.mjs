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
  assert.deepEqual(fs.readdirSync(path.join(dir, "s")).sort(), ["head-000.json", "new-000.json", "rec-000.json"], "and writes the newest projection alongside them");
});
test("the newest projection holds the most recent records in date order, capped, in head shape", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-"));
  const many = Array.from({ length: 260 }, (_, i) => ({ ...rec(i), ts: 1_700_000_000 + i }));
  const written = await writeSourceShards(dir, "s", many, { maxBytes: MAX_SHARD_BYTES });
  assert.equal(written.newest, "s/new-000.json");
  const newest = JSON.parse(fs.readFileSync(path.join(dir, "s/new-000.json"), "utf8"));
  assert.equal(newest.length, 200, "capped");
  assert.deepEqual(newest.map(r => r.ts), [...newest.map(r => r.ts)].sort((a, b) => b - a), "in date order");
  assert.equal(newest[0].ts, 1_700_000_259, "newest first");
  assert.deepEqual(Object.keys(newest[0]).sort(), ["c", "id", "k", "n", "nsfw", "t", "tok", "ts"], "head shape, not the whole record");
  assert.ok(written.hashes["s/new-000.json"], "hashed like every other file");
});

// Stable shards (2026-10-20): a night changes ~1% of Chub's records (370 added, 547 removed, 168 edited of 124,563) yet
// 173 of 190 shards were rewritten, because records were packed afresh in id order and every insert or removal shifted
// all the shards after it. The repo grew 11-17 MB a night and every visitor re-downloaded every shard. Now a record
// stays in the shard it was first written to; new ones go at the end; a full repack happens only when shards get sparse.
test("planShards: a removal, an edit or an addition changes only its own shard (or the last); no previous means a fresh pack", async () => {
  const { planShards } = await import("../crawler/lib/shard.mjs");
  const recs = Array.from({ length: 300 }, (_, i) => rec(i));
  const first = planShards(recs, null, { maxBytes: 20000 });
  assert.deepEqual(first.map(s => s.map(r => r.id)), shardRecords(recs, { maxBytes: 20000 }).map(s => s.map(r => r.id)));
  const prev = first.map(s => s.map(r => r.id));
  const same = (a, b) => a.map((s, i) => JSON.stringify(s) === JSON.stringify(b[i]));
  const removed = planShards(recs.filter(r => r.id !== recs[5].id), prev, { maxBytes: 20000 });
  assert.equal(removed.length, first.length);
  assert.deepEqual(same(first, removed).map((x, i) => x || i), first.map((_, i) => (i === 0 ? 0 : true)), "only the shard that held it changed");
  const edited = planShards(recs.map(r => (r.id === recs[150].id ? { ...r, n: "Renamed" } : r)), prev, { maxBytes: 20000 });
  const editedShard = first.findIndex(s => s.some(r => r.id === recs[150].id));
  assert.deepEqual(same(first, edited).map((x, i) => x || i), first.map((_, i) => (i === editedShard ? i : true)));
  const added = planShards([...recs, rec(900), rec(901)], prev, { maxBytes: 20000 });
  assert.deepEqual(same(first, added).slice(0, -1), first.slice(0, -1).map(() => true), "every shard but the last is untouched");
  assert.deepEqual(added.flat().map(r => r.id).slice(-2), [rec(900).id, rec(901).id], "new records go at the end");
  for (const s of added) assert.ok(Buffer.byteLength(JSON.stringify(s)) <= 20000);
});
test("planShards repacks when removals leave the shards sparse, and keeps an emptied shard so the names after it hold", async () => {
  const { planShards } = await import("../crawler/lib/shard.mjs");
  const recs = Array.from({ length: 300 }, (_, i) => rec(i));
  const prev = planShards(recs, null, { maxBytes: 20000 }).map(s => s.map(r => r.id));
  const emptied = planShards(recs.filter(r => !prev[1].includes(r.id)), prev, { maxBytes: 20000 });
  assert.equal(emptied.length, prev.length); assert.deepEqual(emptied[1], [], "an emptied shard stays, empty");
  const sparse = planShards(recs.filter((_, i) => i % 5 === 0), prev, { maxBytes: 20000 });
  assert.ok(sparse.length < prev.length, "four fifths gone: one fresh pack instead of mostly empty shards");
});
test("writeSourceShards keeps the previous shards' membership: one removal rewrites one rec file and one head file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pantheon-"));
  const recs = Array.from({ length: 2000 }, (_, i) => rec(i));
  const a = await writeSourceShards(dir, "s", recs, { maxBytes: 60000 });
  assert.ok(a.recs.length > 5);
  const b = await writeSourceShards(dir, "s", recs.filter(r => r.id !== recs[1].id), { maxBytes: 60000 });
  const changed = Object.keys(a.hashes).filter(f => /\/(rec|head)-/.test(f) && a.hashes[f] !== b.hashes[f]);
  assert.deepEqual(changed.sort(), ["s/head-000.json", "s/rec-000.json"]);
});
