// Character Tavern through its sitemap (2026-10-20). The crawler used to read /api/homepage/sections (~80 cards a night),
// which robots.txt disallows. The sitemap (allowed) lists every public character with its last change and cover, and
// each character page's SvelteKit data (/character/<path>/__data.json, allowed, ~9 KB) carries every field. A card whose
// sitemap date is not newer than what is held costs no request; the rest are read newest first, up to a nightly budget,
// so the first nights fill the ~4,200 and later nights read only what changed. Its terms forbid automated access; Cash
// decided to read it anyway (2026-10-20, recorded in sources.json). Card PNGs live on a CORS-open storage host.
import { makeRecord, makeId, RecordError } from "../lib/record.mjs";
import { isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "character-tavern", label: "Character Tavern", kinds: ["character"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  sitemapUrl: "https://character-tavern.com/sitemap.xml",
  probe: "https://character-tavern.com/",
  storage: "https://ct-cards.storage.character-tavern.com/",
  originBase: "https://character-tavern.com/character/",
};
// ~0.7 s a read from a datacenter (measured 2026-10-20); 600 is ~7 minutes of a ~50-minute nightly run, so the
// ~4,200 fill in about a week and later nights read only what changed.
export const DEFAULT_LIMITS = { dataPerNight: 600 };
// Records from the old homepage-sections route carried the section as a tag and no fields of their own: read them again.
const OLD_SECTIONS = ["trending", "popular", "newest"];
const PATH = /^[\w-][\w.-]*\/[\w-][\w.-]*$/;
export function cardUrl(path) { return meta.storage + String(path).split("/").map(encodeURIComponent).join("/") + ".png"; }
export function coverUrl(path) { return cardUrl(path) + "?width=320&quality=80&format=auto"; }
export function dataUrl(path) { return meta.originBase + String(path).split("/").map(encodeURIComponent).join("/") + "/__data.json"; }
const secs = v => { const n = Date.parse(String(v || "")); return Number.isFinite(n) ? Math.floor(n / 1000) : null; };

export function parseSitemap(xml) {
  const rows = [];
  for (const m of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (/<loc>([^<]*)<\/loc>/.exec(m[1]) || [])[1] || "";
    const at = loc.indexOf("/character/"); if (at < 0) continue;
    let path; try { path = decodeURIComponent(loc.slice(at + "/character/".length).replace(/\/+$/, "")); } catch { continue; }
    if (!PATH.test(path)) continue;
    rows.push({ path, lastmod: secs((/<lastmod>([^<]*)<\/lastmod>/.exec(m[1]) || [])[1]) || 0 });
  }
  return rows;
}

// devalue's flat form, as SvelteKit sends page data: slot 0 is the root, an object's values and an array's items are
// slot numbers, anything else in a slot is the value itself, and a negative slot is one of devalue's constants.
const CONSTANTS = { "-1": undefined, "-2": undefined, "-3": NaN, "-4": Infinity, "-5": -Infinity, "-6": -0 };
export function unflatten(arr) {
  const done = new Map();
  const at = i => {
    if (typeof i !== "number") return undefined;
    if (i < 0) return CONSTANTS[String(i)];
    if (done.has(i)) return done.get(i);
    const x = arr[i];
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) {
      if (typeof x[0] === "string") { const v = x[0] === "Date" ? x[1] : undefined; done.set(i, v); return v; }
      const out = []; done.set(i, out); for (const j of x) out.push(at(j)); return out;
    }
    const out = {}; done.set(i, out); for (const [k, j] of Object.entries(x)) out[k] = at(j); return out;
  };
  return at(0);
}

export function dataRecord(text, { ts }) {
  let first; try { first = JSON.parse(String(text || "").split("\n")[0]); } catch { return null; }
  const node = (first && Array.isArray(first.nodes) ? first.nodes : []).find(n => n && n.type === "data" && Array.isArray(n.data) && n.data[0] && typeof n.data[0] === "object" && "character" in n.data[0]);
  if (!node) return null;
  const root = unflatten(node.data); const ch = root && root.character;
  if (!ch || typeof ch.path !== "string" || !PATH.test(ch.path) || (ch.visibility && ch.visibility !== "public")) return null;
  const warnings = Array.isArray(root.contentWarnings) ? root.contentWarnings.map(String) : [];
  const tags = Array.isArray(root.tags) ? root.tags.map(String) : [];
  try {
    return makeRecord({
      src: meta.id, k: "character", nid: ch.path, n: ch.name || ch.inChatName, b: ch.tagline || ch.description || "",
      t: [...tags, ...warnings], c: coverUrl(ch.path), nsfw: Boolean(ch.isNSFW) || isNsfwTags(warnings), o: meta.originBase + ch.path,
      p: { tr: "plain", u: cardUrl(ch.path), f: "ccv2png" }, caps: meta.caps, tok: Number(ch.tokenTotal) || null,
      ts: secs(ch.lastUpdatedAt) || secs(ch.createdAt) || ts, lb: ch.lorebookId != null, cr: typeof root.authorUsername === "string" ? root.authorUsername : undefined,
    });
  } catch (e) { if (e instanceof RecordError) return null; throw e; }
}

export async function crawl(fetcher, { ts, limits = DEFAULT_LIMITS, log = () => {}, previous = [], deadline = Infinity }) {
  const budget = (limits && limits.dataPerNight) || DEFAULT_LIMITS.dataPerNight;
  let xml;
  try { ({ body: xml } = await fetcher.text(meta.sitemapUrl)); } catch (e) { return { records: [], errors: [{ message: String(e.message || e) }] }; }
  const rows = parseSitemap(xml);
  if (!rows.length) return { records: [], errors: [{ message: "the sitemap listed no characters" }] };
  const held = new Map((previous || []).filter(r => r && r.src === meta.id).map(r => [r.id, r]));
  const records = []; const queue = []; const errors = [];
  for (const row of rows) {
    const old = held.get(makeId(meta.id, "character", row.path));
    const fromSections = old && Array.isArray(old.t) && old.t.some(t => OLD_SECTIONS.includes(t));
    if (old && !fromSections && (old.ts || 0) >= row.lastmod) records.push(old); else queue.push({ row, old });
  }
  queue.sort((a, b) => b.row.lastmod - a.row.lastmod);
  let reads = 0; let failed = 0;
  for (const { row, old } of queue) {
    // Out of budget or near the run's deadline: what is held stays, the rest waits for a later night.
    if (reads >= budget || Date.now() > deadline - 120000) { if (old) records.push(old); continue; }
    reads++;
    try {
      const { body } = await fetcher.text(dataUrl(row.path), { headers: { accept: "application/json" } });
      const rec = dataRecord(body, { ts });
      if (rec) records.push(rec); else { failed++; if (old) records.push(old); }
    } catch (e) { failed++; if (old) records.push(old); if (errors.length < 20) errors.push({ path: row.path, message: String(e.message || e) }); }
  }
  log(`${meta.id}: ${rows.length} in the sitemap, ${records.length} records, ${reads} read (${queue.length} new or changed, budget ${budget}), ${failed} failed`);
  return { records, errors };
}
