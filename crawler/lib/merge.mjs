// previous index ⊕ this crawl. A record's ts is "last seen"; unseen for PRUNE_DAYS → dropped (spec §8.3).
// If this crawl failed for the source, nothing is pruned — a broken adapter must not empty a source.
export const PRUNE_DAYS = 30;
export function mergeWithPrevious(previous, fresh, { now, crawlOk = true }) {
  const byId = new Map();
  for (const r of previous || []) byId.set(r.id, r);
  for (const r of fresh || []) byId.set(r.id, r);
  const cutoff = now - PRUNE_DAYS * 86400;
  const out = [...byId.values()].filter(r => !crawlOk || r.ts >= cutoff);
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
