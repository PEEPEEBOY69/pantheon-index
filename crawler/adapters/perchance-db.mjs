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

// The database's own categories as tags; its rating goes to the nsfw flag instead. Its keys come spelled every way
// ("Rating", "Age Group", "age_group"; ~900 of 934 capitalised, 2026-10-20), so they are read case- and spacing-blind.
// The explicit fields (sexual content, preferences, experience, fetishes) mark a card NSFW and are not shown as tags.
const keyed = cat => { const out = {}; for (const [k, v] of Object.entries(cat || {})) out[String(k).toLowerCase().replace(/[_\s]+/g, " ").trim()] = v; return out; };
const list = v => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []).filter(x => typeof x === "string" && x.trim()).map(x => x.trim());
const TAG_KEYS = ["genre", "species", "gender", "role", "personality", "source", "setting", "age group", "physical traits", "work name"];
const EXPLICIT_KEYS = ["sexual content", "sexual preferences", "sexual experience", "fetishes"];
export function tagsOf(cat) {
  const c = keyed(cat); const out = [];
  for (const k of TAG_KEYS) for (const v of list(c[k])) if (!out.includes(v)) out.push(v);
  return out;
}
export function isNsfwEntry(manifest, path) {
  const c = keyed(manifest && manifest.categories);
  if (list(c.rating).some(r => r.toLowerCase() === "nsfw")) return true;
  if (/^nsfw\//i.test(String(path || ""))) return true;
  return EXPLICIT_KEYS.some(k => list(c[k]).some(v => !/^(none|no)$/i.test(v)));
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
        nsfw: isNsfwEntry(m, path),
        o: meta.originBase + encPath(path),
        p: { tr: "plain", u: REPO + encPath(m.downloadPath), f: "dexiegz" },
        caps: meta.caps, ts, cr: typeof m.author === "string" ? m.author : "",
      }));
    } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
  }
  log(`${meta.id}: ${records.length} records, ${skipped} skipped`);
  return { records, errors };
}
