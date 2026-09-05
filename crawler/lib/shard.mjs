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

export async function writeSourceShards(root, src, records, { maxBytes = MAX_SHARD_BYTES } = {}) {
  const dir = path.join(root, src); await fs.mkdir(dir, { recursive: true });
  for (const f of await fs.readdir(dir)) if (/^(head|rec|new)-\d{3}\.json$/.test(f)) await fs.unlink(path.join(dir, f));
  const guarded = records.map(applyNsfwGuard);
  const recShards = shardRecords(guarded, { maxBytes });
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
