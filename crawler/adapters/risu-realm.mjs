// RisuAI Realm: the list endpoint its own client uses (found in kwaroran/RisuAI src/ts/characterCards.ts, 2026-09-02):
//   GET https://sv.risuai.xyz/realm/<encoded "search==…&&page==N&&nsfw==bool&&sort==…&&web==web">?cache=30
// 30 cards a page for sorts "" / downloads / trending / random (the client's "recommended" is page-0-only).
// Downloads are PNG (older) or charx zip (newer), both CORS *, no headers needed. Covers are the full card files, so none.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "risu-realm", label: "RisuAI Realm", kinds: ["character"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  hub: "https://sv.risuai.xyz", originBase: "https://realm.risuai.net/character/", downloadBase: "https://realm.risuai.net/api/v1/download/dynamic/",
  headers: { "x-risuai-info": "170.0.0;web" },
  probe: "https://sv.risuai.xyz/realm/" + encodeURIComponent("search== __shared&&page==0&&nsfw==false&&sort==downloads&&web==web") + "?cache=30",
};
export const DEFAULT_LIMITS = { pagesPerSort: { downloads: 60, trending: 20, "": 20, random: 8 }, maxRequests: 260 };
export function listUrl({ search = "", page = 0, nsfw = false, sort = "downloads" }) { return meta.hub + "/realm/" + encodeURIComponent(`search==${search} __shared&&page==${page}&&nsfw==${nsfw}&&sort==${sort}&&web==web`) + "?cache=30"; }
export function cleanDesc(desc) {
  let s = String(desc || "");
  const en = /#\s*`en`\s*\n([\s\S]*?)(?=\n#\s*`[a-z]{2}`|$)/i.exec(s); if (en) s = en[1];
  return s.replace(/^#+\s.*$/gm, " ").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
}
export function parseCount(s) { const m = /^([\d.]+)\s*([km])?$/i.exec(String(s || "").trim()); if (!m) return 0; const n = parseFloat(m[1]); return Math.round(m[2] ? n * (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : n); }

export async function crawl(fetcher, { ts, limits = DEFAULT_LIMITS, log = () => {} }) {
  const errors = []; const byId = new Map(); let requests = 0; let skipped = 0;
  const pagesPerSort = limits.pagesPerSort || DEFAULT_LIMITS.pagesPerSort; const maxRequests = limits.maxRequests || DEFAULT_LIMITS.maxRequests;
  for (const nsfw of [false, true]) {
    for (const [sort, pages] of Object.entries(pagesPerSort)) {
      for (let page = 0; page < pages; page++) {
        if (requests >= maxRequests) break;
        let body; requests++;
        try { ({ body } = await fetcher.json(listUrl({ page, nsfw, sort }), { headers: meta.headers })); } catch (e) { errors.push({ sort, page, nsfw, message: String(e.message || e) }); break; }
        const cards = Array.isArray(body) ? body : (body && Array.isArray(body.cards) ? body.cards : []);
        if (!cards.length) break;
        let fresh = 0;
        for (const raw of cards) {
          if (!raw || typeof raw.id !== "string" || !/^[0-9a-f-]{20,}$/i.test(raw.id) || raw.hidden) { skipped++; continue; }
          if (byId.has(raw.id)) continue;
          const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
          try {
            byId.set(raw.id, makeRecord({ src: meta.id, k: "character", nid: raw.id, n: String(raw.name || "").replace(/[*_`#]/g, "").trim(), b: cleanDesc(raw.desc), t: tags, c: null, nsfw: nsfw || isNsfwTags(tags), o: meta.originBase + raw.id, p: { tr: "plain", u: meta.downloadBase + raw.id + "?cors=true", f: "charx" }, caps: meta.caps, tok: null, ts }));
            fresh++;
          } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
        }
        log(`${meta.id}: ${sort || "newest"} nsfw=${nsfw} page ${page} → ${cards.length} cards, ${fresh} new`);
        if (cards.length < 30 && sort !== "random") break;
      }
    }
  }
  log(`${meta.id}: ${byId.size} records from ${requests} requests, ${skipped} skipped, ${errors.length} errors`);
  return { records: [...byId.values()], errors };
}
