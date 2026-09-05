// Public repos tagged character-cards / character-card / lorebook. Free API (60/h anon, 1000/h with GITHUB_TOKEN in Actions).
import { makeRecord, RecordError } from "../lib/record.mjs";
import { parseCardPng } from "../lib/png-card.mjs";
import { characterFromCard, lorebookFromStWi, detectFormat, estimateTokens, isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "github", label: "GitHub card repos", kinds: ["character", "lorebook"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  topics: ["character-cards", "character-card", "lorebook", "sillytavern", "tavern-cards", "character-ai", "chub", "world-info", "silly-tavern"],
  // Plenty of card repos never set a topic at all, so search their names too. Read at 2026-09-05:
  // topics alone found 222 records across three topics.
  searches: ["sillytavern characters in:name,description", "tavern character cards in:name,description", "character cards collection in:name,description", "lorebook in:name,description worldinfo"],
  probe: "https://api.github.com/search/repositories?q=topic:character-cards&per_page=1",
};
const MAX_FILE = 2 * 1024 * 1024;

export async function crawl(fetcher, { ts, token = process.env.GITHUB_TOKEN, limits = { repos: 140, filesPerRepo: 300 }, log = () => {} }) {
  const headers = { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const errors = []; const byId = new Map(); const repos = new Map();
  const queries = [...meta.topics.map(t => "topic:" + t), ...(meta.searches || [])];
  for (const topic of queries) {
    try {
      const { body } = await fetcher.json(`https://api.github.com/search/repositories?q=${encodeURIComponent(topic).replace(/%3A/g, ":").replace(/%2C/g, ",")}&sort=updated&per_page=100`, { headers });
      for (const r of body?.items || []) if (r && r.full_name && !repos.has(r.full_name)) repos.set(r.full_name, r);
    } catch (e) { errors.push({ topic, message: String(e.message || e) }); }
  }
  for (const r of [...repos.values()].slice(0, limits.repos)) {
    const branch = r.default_branch || "main";
    try {
      const { body } = await fetcher.json(`https://api.github.com/repos/${r.full_name}/git/trees/${branch}?recursive=1`, { headers });
      const files = (body?.tree || []).filter(f => f.type === "blob" && f.size <= MAX_FILE && /\.(png|json)$/i.test(f.path)).slice(0, limits.filesPerRepo);
      for (const f of files) {
        const url = `https://raw.githubusercontent.com/${r.full_name}/${branch}/${f.path}`;
        const origin = `https://github.com/${r.full_name}/blob/${branch}/${f.path}`;
        const nid = `${r.full_name}/${f.path}`;
        try {
          let obj, format;
          if (/\.png$/i.test(f.path)) { obj = parseCardPng((await fetcher.bytes(url)).body); format = obj ? "ccv2png" : null; }
          else { obj = (await fetcher.json(url)).body; format = detectFormat(obj); }
          if (!obj || !format) continue;
          if (format === "stwi") {
            const lb = lorebookFromStWi(obj); if (!lb) continue;
            byId.set(`github:lorebook:${nid}`, makeRecord({ src: meta.id, k: "lorebook", nid, n: lb.name, b: lb.description || `${lb.entries.length} entries`, t: r.topics, c: null, nsfw: isNsfwTags(r.topics), o: origin, p: { tr: "plain", u: url, f: "stwi" }, caps: meta.caps, tok: estimateTokens(lb), ts }));
          } else {
            const c = characterFromCard(obj); if (!c) continue;
            byId.set(`github:character:${nid}`, makeRecord({ src: meta.id, k: "character", nid, n: c.name, b: c.creator_notes || c.description, t: c.tags.length ? c.tags : r.topics, c: c.avatar, nsfw: isNsfwTags(c.tags), o: origin, p: { tr: "plain", u: url, f: format }, caps: meta.caps, tok: estimateTokens(c), ts }));
          }
        } catch (e) { if (!(e instanceof RecordError)) errors.push({ file: url, message: String(e.message || e) }); }
      }
      log(`${meta.id}: ${r.full_name} → ${files.length} files`);
    } catch (e) { errors.push({ repo: r.full_name, message: String(e.message || e) }); }
  }
  return { records: [...byId.values()], errors };
}
