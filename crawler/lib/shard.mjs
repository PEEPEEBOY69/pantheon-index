import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { toHead, applyNsfwGuard } from "./record.mjs";
export const MAX_SHARD_BYTES = 1.5 * 1024 * 1024;
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
  for (const f of await fs.readdir(dir)) if (/^(head|rec)-\d{3}\.json$/.test(f)) await fs.unlink(path.join(dir, f));
  const guarded = records.map(applyNsfwGuard);
  const recShards = shardRecords(guarded, { maxBytes });
  const heads = [], recs = [], hashes = {}; let bytes = 0;
  for (const [i, shard] of recShards.entries()) {
    const n = String(i).padStart(3, "0");
    const recName = `${src}/rec-${n}.json`, headName = `${src}/head-${n}.json`;
    const recJson = JSON.stringify(shard), headJson = JSON.stringify(shard.map(toHead));
    await fs.writeFile(path.join(root, recName), recJson); await fs.writeFile(path.join(root, headName), headJson);
    hashes[recName] = sha256(recJson); hashes[headName] = sha256(headJson);
    bytes += Buffer.byteLength(recJson) + Buffer.byteLength(headJson);
    recs.push(recName); heads.push(headName);
  }
  return { heads, recs, hashes, bytes, count: records.length };
}
