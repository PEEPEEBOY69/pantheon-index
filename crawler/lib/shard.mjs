import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { toHead, applyNsfwGuard } from "./record.mjs";
// 400 KB, not 1.5 MB: a reader pulls whole shards, and a browsing row reads two per source, so the
// shard size *is* the cost of opening the page. Smaller shards mean the same coverage for a quarter
// of the bytes (9.5 MB → 2.6 MB on a first visit, measured 2026-09-05); the extra files cost the
// CDN nothing.
export const MAX_SHARD_BYTES = 400 * 1024;
const sha256 = s => createHash("sha256").update(s).digest("hex");

export function shardRecords(records, { maxBytes = MAX_SHARD_BYTES } = {}) {
  const shards = []; let cur = []; let size = 2;
  for (const r of records) {
    const len = Buffer.byteLength(JSON.stringify(r)) + 1;
    if (cur.length && size + len > maxBytes) { shards.push(cur); cur = []; size = 2; }
    cur.push(r); size += len;
  }
  if (cur.length || shards.length === 0) shards.push(cur);
  return shards;
}

// Stable shards (2026-10-20). Packing afresh in id order meant one insert or removal shifted every shard after it: a
// night that changed ~1% of Chub rewrote 173 of its 190 shards, the repo grew 11-17 MB a night, and every returning
// visitor downloaded every shard again. Now a record stays in the shard it was first written to (edited in place,
// dropped when it goes), new records fill the last shard and then new ones, and an emptied shard stays as [] so the
// names after it hold. When removals leave the set sparse (more than half again the shards the bytes need), or a shard
// has grown half again past the cap, it is packed afresh once.
export function planShards(records, previous, { maxBytes = MAX_SHARD_BYTES, slack = 1.5 } = {}) {
  if (!Array.isArray(previous) || !previous.length) return shardRecords(records, { maxBytes });
  const size = r => Buffer.byteLength(JSON.stringify(r)) + 1;
  const byId = new Map(records.map(r => [r.id, r])); const placed = new Set(); const shards = [];
  for (const ids of previous) { const s = []; for (const id of ids || []) { const r = byId.get(id); if (r && !placed.has(id)) { s.push(r); placed.add(id); } } shards.push(s); }
  let last = shards[shards.length - 1]; let lastSize = 2 + last.reduce((n, r) => n + size(r), 0);
  for (const r of records) {
    if (placed.has(r.id)) continue;
    const len = size(r); if (last.length && lastSize + len > maxBytes) { last = []; shards.push(last); lastSize = 2; }
    last.push(r); lastSize += len; placed.add(r.id);
  }
  const total = records.reduce((n, r) => n + size(r), 0); const needed = Math.max(1, Math.ceil(total / maxBytes));
  const sparse = shards.length > Math.ceil(needed * slack) + 1;
  const swollen = shards.some(s => 2 + s.reduce((n, r) => n + size(r), 0) > maxBytes * slack);
  return sparse || swollen ? shardRecords(records, { maxBytes }) : shards;
}

export async function writeSourceShards(root, src, records, { maxBytes = MAX_SHARD_BYTES } = {}) {
  const dir = path.join(root, src); await fs.mkdir(dir, { recursive: true });
  // The membership of the shards on disk, read before they are replaced: which ids each rec-NNN held, in order.
  const recFiles = (await fs.readdir(dir)).filter(f => /^rec-\d{3}\.json$/.test(f)).sort();
  const previous = [];
  for (const f of recFiles) { try { previous.push(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")).map(r => r && r.id).filter(Boolean)); } catch { previous.length = 0; break; } }
  for (const f of await fs.readdir(dir)) if (/^(head|rec|new)-\d{3}\.json$/.test(f)) await fs.unlink(path.join(dir, f));
  const guarded = records.map(applyNsfwGuard);
  const recShards = planShards(guarded, previous, { maxBytes });
  const heads = [], recs = [], hashes = {}; let bytes = 0;
  // A "newest" projection, so the just-added row does not have to read every shard of every source
  // to sort by date (that alone pulled 80 shards on a first visit, measured 2026-09-05).
  const NEWEST = 200;
  for (const [i, shard] of recShards.entries()) {
    const n = String(i).padStart(3, "0");
    const recName = `${src}/rec-${n}.json`, headName = `${src}/head-${n}.json`;
    const recJson = JSON.stringify(shard), headJson = JSON.stringify(shard.map(toHead));
    await fs.writeFile(path.join(root, recName), recJson); await fs.writeFile(path.join(root, headName), headJson);
    hashes[recName] = sha256(recJson); hashes[headName] = sha256(headJson);
    bytes += Buffer.byteLength(recJson) + Buffer.byteLength(headJson);
    recs.push(recName); heads.push(headName);
  }
  const newestName = `${src}/new-000.json`;
  const newestJson = JSON.stringify([...guarded].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, NEWEST).map(toHead));
  await fs.writeFile(path.join(root, newestName), newestJson);
  hashes[newestName] = sha256(newestJson); bytes += Buffer.byteLength(newestJson);
  return { heads, recs, hashes, bytes, count: records.length, newest: newestName };
}
