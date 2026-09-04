// Tag facets (spec §8.2). The index carries 12,902 distinct character tags, 3,291 lorebook and
// 1,027 scenario ones, and the vocabularies barely overlap — a single hand-written seed list was
// never going to describe them. The crawler counts the real ones once per night and publishes them,
// so the plugin gets a per-kind vocabulary for a few tens of KB instead of scanning 34k records.
export const KINDS = ["character", "lorebook", "scenario"];
export const TAGS_PER_KIND = 400;

// Sources spell the same idea several ways ("slice of life" / "slice-of-life", "romance optional" /
// "romance-optional"). Folding gives one bucket; `label` keeps whichever spelling was most common.
export function foldTag(tag) {
  // Strip what we do not keep BEFORE collapsing whitespace, or "sfw <-> nsfw" folds to "sfw   nsfw".
  return String(tag == null ? "" : tag).toLowerCase().replace(/[_\u2010-\u2015-]/g, " ").replace(/[^a-z0-9 +&']/g, " ").replace(/\s+/g, " ").trim();
}
const JUNK = new Set(["", "root", "tavern", "origin chub", "chub", "character", "characters", "lorebook", "lorebooks", "scenario", "scenarios", "card", "cards", "bot", "bots", "ai", "english", "oc", "any", "misc", "other", "none", "untagged", "sfw", "n a"]);

export function buildTagFacets(records, { perKind = TAGS_PER_KIND, minCount = 2 } = {}) {
  const byKind = new Map(KINDS.map(k => [k, new Map()]));
  for (const r of records) {
    if (!r || !byKind.has(r.k) || !Array.isArray(r.t)) continue;
    const seen = new Set();
    for (const raw of r.t) {
      const key = foldTag(raw);
      if (!key || key.length > 32 || JUNK.has(key) || seen.has(key)) continue;
      seen.add(key);
      const table = byKind.get(r.k);
      let e = table.get(key);
      if (!e) { e = { n: 0, labels: new Map() }; table.set(key, e); }
      e.n++;
      const label = String(raw).trim();
      e.labels.set(label, (e.labels.get(label) || 0) + 1);
    }
  }
  const out = {};
  for (const kind of KINDS) {
    const table = byKind.get(kind);
    const rows = [...table.entries()]
      .filter(([, e]) => e.n >= minCount)
      .sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))
      .slice(0, perKind)
      .map(([key, e]) => {
        const label = [...e.labels.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
        return [key, e.n, label === key ? undefined : label];
      })
      .map(row => (row[2] === undefined ? [row[0], row[1]] : row));
    out[kind] = rows;
  }
  return out;
}
