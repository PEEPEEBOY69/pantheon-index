// HuggingFace datasets that contain card PNGs / card JSON / World Info JSON. Open API, no bot wall.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { parseCardPng } from "../lib/png-card.mjs";
import { characterFromCard, lorebookFromStWi, detectFormat, estimateTokens, isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "huggingface", label: "HuggingFace datasets", kinds: ["character", "lorebook"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  probe: "https://huggingface.co/api/datasets?search=character%20card&limit=1",
  queries: ["character card", "sillytavern", "tavern card", "lorebook", "world info"],
};
const MAX_FILE = 2 * 1024 * 1024;
const api = "https://huggingface.co";

export async function crawl(fetcher, { ts, limits = { datasets: 20, filesPerDataset: 200 }, log = () => {} }) {
  const errors = []; const byId = new Map(); const seenDatasets = new Set();
  const datasets = [];
  for (const q of meta.queries) {
    try {
      const { body } = await fetcher.json(`${api}/api/datasets?search=${encodeURIComponent(q)}&limit=100&sort=downloads&direction=-1`);
      for (const d of Array.isArray(body) ? body : []) if (d && d.id && !seenDatasets.has(d.id)) { seenDatasets.add(d.id); datasets.push(d); }
    } catch (e) { errors.push({ query: q, message: String(e.message || e) }); }
    if (datasets.length >= limits.datasets) break;
  }
  for (const d of datasets.slice(0, limits.datasets)) {
    try {
      const { body: tree } = await fetcher.json(`${api}/api/datasets/${d.id}/tree/main?recursive=true`);
      const files = (Array.isArray(tree) ? tree : []).filter(f => f.type === "file" && f.size <= MAX_FILE && /\.(png|json)$/i.test(f.path)).slice(0, limits.filesPerDataset);
      for (const f of files) {
        const url = `${api}/datasets/${d.id}/resolve/main/${f.path}`;
        try {
          let obj = null, format = null;
          if (/\.png$/i.test(f.path)) { obj = parseCardPng((await fetcher.bytes(url)).body); format = obj ? "ccv2png" : null; }
          else { obj = (await fetcher.json(url)).body; format = detectFormat(obj); }
          if (!obj || !format) continue;
          const nid = `${d.id}/${f.path}`;
          const origin = `${api}/datasets/${d.id}/blob/main/${f.path}`;
          if (format === "stwi") {
            const lb = lorebookFromStWi(obj); if (!lb) continue;
            byId.set(`huggingface:lorebook:${nid}`, makeRecord({ src: meta.id, k: "lorebook", nid, n: lb.name, b: lb.description || `${lb.entries.length} entries`, t: d.tags, c: null, nsfw: isNsfwTags(d.tags), o: origin, p: { tr: "plain", u: url, f: "stwi" }, caps: meta.caps, tok: estimateTokens(lb), ts }));
          } else {
            const c = characterFromCard(obj); if (!c) continue;
            byId.set(`huggingface:character:${nid}`, makeRecord({ src: meta.id, k: "character", nid, n: c.name, b: c.creator_notes || c.description, t: c.tags.length ? c.tags : d.tags, c: c.avatar, nsfw: isNsfwTags(c.tags) || isNsfwTags(d.tags), o: origin, p: { tr: "plain", u: url, f: format }, caps: meta.caps, tok: estimateTokens(c), ts }));
          }
        } catch (e) { if (!(e instanceof RecordError)) errors.push({ file: url, message: String(e.message || e) }); }
      }
      log(`${meta.id}: ${d.id} → ${files.length} files`);
    } catch (e) { errors.push({ dataset: d.id, message: String(e.message || e) }); }
  }
  return { records: [...byId.values()], errors };
}
