// The Perchance Character Database (github.com/nosfertm/perchance-character-database): a community collection of
// Perchance AI Character Chat characters. Its creative works are CC BY-SA 4.0 (TERMS_AND_CONDITIONS.md, read
// 2026-10-04), so every record names the author and links the original folder. One index file lists every character
// (934 on 2026-10-04); the character itself is the official chat's export (a gzip of its Dexie JSON), which the
// plugin reads when someone imports it. Mirror the index, not the files.
import { makeRecord, RecordError } from "../lib/record.mjs";

const REPO = "https://raw.githubusercontent.com/nosfertm/perchance-character-database/main/";

export const meta = {
  id: "perchance-db", label: "Perchance Character Database", kinds: ["character"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  indexUrl: REPO + "ai-character-chat/characters/index.json",
  probe: REPO + "ai-character-chat/characters/index.json",
  originBase: "https://github.com/nosfertm/perchance-character-database/tree/main/ai-character-chat/characters/",
  license: "CC BY-SA 4.0",
};

const encPath = (p) => String(p).split("/").map(encodeURIComponent).join("/");

// The database's own categories as tags; its rating goes to the nsfw flag instead.
export function tagsOf(cat) {
  const c = cat || {};
  const out = [];
  for (const k of ["genre", "species", "gender", "role", "personality", "source"]) for (const v of Array.isArray(c[k]) ? c[k] : []) if (typeof v === "string" && v.trim()) out.push(v.trim());
  return out;
}

export async function crawl(fetcher, { ts, log = () => {} }) {
  const errors = []; const records = [];
  let body;
  try { ({ body } = await fetcher.json(meta.indexUrl)); } catch (e) { return { records, errors: [{ message: String(e.message || e) }] }; }
  if (!Array.isArray(body)) return { records, errors: [{ message: "index is not an array" }] };
  let skipped = 0;
  for (const row of body) {
    const m = row && row.manifest; const path = row && row.path;
    if (!m || typeof path !== "string" || !m.name || !m.downloadPath) { skipped++; continue; }
    try {
      records.push(makeRecord({
        src: meta.id, k: "character", nid: path.replace(/\s+/g, "_"), n: String(m.name), b: typeof m.description === "string" ? m.description : "",
        t: tagsOf(m.categories), c: typeof m.imageUrl === "string" && /^https:\/\//.test(m.imageUrl) ? m.imageUrl : null,
        nsfw: String((m.categories || {}).rating || "").toLowerCase() === "nsfw",
        o: meta.originBase + encPath(path),
        p: { tr: "plain", u: REPO + encPath(m.downloadPath), f: "dexiegz" },
        caps: meta.caps, ts, cr: typeof m.author === "string" ? m.author : "",
      }));
    } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
  }
  log(`${meta.id}: ${records.length} records, ${skipped} skipped`);
  return { records, errors };
}
