// AI Character Cards: open JSON listing (api.aicharactercards.com/api/cards, 100 per page, ~560 cards, measured 2026-09-02).
// The API has no CORS; the card files under /uploads/ do (access-control-allow-origin: *). /download counts downloads and
// rate-limits, so we never use it: the original PNG lives next to the optimised cover and is derived from imageUrl.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { parseCardPng } from "../lib/png-card.mjs";
import { isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "aicharactercards", label: "AI Character Cards", kinds: ["character"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  api: "https://api.aicharactercards.com/api/cards", host: "https://api.aicharactercards.com",
  originBase: "https://aicharactercards.com/cards/",
  probe: "https://api.aicharactercards.com/api/cards?page=1&limit=1",
};
export function stripHtml(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
export function fileUrlFromImage(imageUrl) { if (typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) return null; const png = imageUrl.replace(/-opt\.webp$/i, ".png"); return /\.png$/i.test(png) ? meta.host + png : null; }

export async function crawl(fetcher, { ts, limits = { pages: 20, perPage: 100, verify: 3 }, log = () => {} }) {
  const errors = []; const byId = new Map(); let skipped = 0; let verified = null;
  for (let page = 1; page <= limits.pages; page++) {
    let body;
    try { ({ body } = await fetcher.json(`${meta.api}?page=${page}&limit=${limits.perPage}`)); } catch (e) { errors.push({ page, message: String(e.message || e) }); break; }
    const items = Array.isArray(body && body.data) ? body.data : [];
    if (!items.length) break;
    for (const raw of items) {
      const tags = Array.isArray(raw.tags) ? raw.tags.map(t => (t && typeof t === "object" ? t.name : t)).filter(Boolean) : [];
      const file = fileUrlFromImage(raw.imageUrl);
      if (file && verified === null) {
        verified = false;
        for (const cand of items.slice(0, limits.verify)) { const u = fileUrlFromImage(cand.imageUrl); if (!u) continue; try { const { body: bytes } = await fetcher.bytes(u); if (parseCardPng(bytes)) { verified = true; break; } } catch { /* try the next */ } }
        log(`${meta.id}: derived card PNGs ${verified ? "carry the card" : "do not carry the card — link-only records"}`);
      }
      try {
        byId.set(String(raw.id), makeRecord({
          src: meta.id, k: "character", nid: raw.id, n: raw.title, b: raw.excerpt || stripHtml(raw.description), t: tags, c: raw.imageUrl ? meta.host + raw.imageUrl : null,
          nsfw: Boolean(raw.isNsfw) || isNsfwTags(tags), o: meta.originBase + raw.id,
          p: file && verified ? { tr: "plain", u: file, f: "ccv2png" } : null, caps: { ...meta.caps, i: Boolean(file && verified) }, tok: Number(raw.tokenCount) || null, ts,
        }));
      } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
    }
    const total = body.pagination && Number(body.pagination.total); if (Number.isFinite(total) && page * limits.perPage >= total) break;
  }
  log(`${meta.id}: ${byId.size} records, ${skipped} skipped`);
  return { records: [...byId.values()], errors };
}
