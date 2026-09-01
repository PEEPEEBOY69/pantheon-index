// previous index ⊕ this crawl.
//   - A record's `ts` is "content last changed": if a fresh record equals the previous one on every
//     field except ts, the previous record is kept byte-for-byte. Unchanged sources produce no diff.
//   - "Last seen" lives in a separate small map (seen.json per source) so the shards stay stable.
//   - Unseen for PRUNE_DAYS → dropped (spec §8.3). If this crawl failed for the source, nothing is
//     pruned — a broken adapter must not empty a source.
export const PRUNE_DAYS = 30;

export function sameContent(a, b) {
  if (!a || !b) return false;
  const { ts: _a, ...x } = a; const { ts: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
}

export function mergeWithPrevious(previous, fresh, { now, crawlOk = true, prevSeen = {} }) {
  const byId = new Map(); const seen = {};
  for (const r of previous || []) { byId.set(r.id, r); seen[r.id] = prevSeen[r.id] ?? r.ts; }
  for (const r of fresh || []) {
    const old = byId.get(r.id);
    byId.set(r.id, old && sameContent(old, r) ? old : r);
    seen[r.id] = now;
  }
  const cutoff = now - PRUNE_DAYS * 86400;
  const records = [...byId.values()].filter(r => !crawlOk || (seen[r.id] ?? 0) >= cutoff);
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept = new Set(records.map(r => r.id));
  for (const id of Object.keys(seen)) if (!kept.has(id)) delete seen[id];
  return { records, seen };
}
