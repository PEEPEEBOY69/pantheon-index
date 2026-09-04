export const BASE = {
  primary: "https://cdn.jsdelivr.net/gh/PEEPEEBOY69/pantheon-index@main/index/",
  fallback: "https://raw.githubusercontent.com/PEEPEEBOY69/pantheon-index/main/index/",
};
export function buildManifest({ builtAt, sources, hashes = {} }) {
  const all = { ...hashes };
  const out = {};
  for (const [id, s] of Object.entries(sources)) { out[id] = { count: s.count, heads: s.heads, recs: s.recs, bytes: s.bytes }; Object.assign(all, s.hashes || {}); }
  return { v: 1, builtAt, base: BASE, sources: out, adaptersUrl: "adapters.json", sourcesUrl: "sources.json", targetsUrl: "targets.json", tagsUrl: "tags.json", hashes: all };
}
