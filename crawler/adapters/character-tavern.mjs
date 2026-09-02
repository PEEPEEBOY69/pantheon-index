// Character Tavern: no public search API (measured 2026-09-02: /api/cards is POST-only and answers 405; cards.character-tavern.com
// is Cloudflare-walled), but the homepage sections endpoint is open JSON and the card PNGs are on a CORS-open storage host.
// We index the three sections every night; the merge keeps everything seen before, so the index grows past the daily 80.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "character-tavern", label: "Character Tavern", kinds: ["character"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  sectionsUrl: "https://character-tavern.com/api/homepage/sections",
  probe: "https://character-tavern.com/api/homepage/sections",
  storage: "https://ct-cards.storage.character-tavern.com/",
  originBase: "https://character-tavern.com/character/",
};
const SECTIONS = ["trending", "popular", "newest"];
export function cardUrl(path) { return meta.storage + String(path).split("/").map(encodeURIComponent).join("/") + ".png"; }
export function coverUrl(path) { return cardUrl(path) + "?width=320&quality=80&format=auto"; }

export async function crawl(fetcher, { ts, log = () => {} }) {
  const errors = []; const byId = new Map();
  let body;
  try { ({ body } = await fetcher.json(meta.sectionsUrl)); } catch (e) { return { records: [], errors: [{ message: String(e.message || e) }] }; }
  if (!body || typeof body !== "object") return { records: [], errors: [{ message: "sections is not an object" }] };
  let skipped = 0;
  for (const section of SECTIONS) {
    const items = Array.isArray(body[section]) ? body[section] : [];
    for (const raw of items) {
      if (!raw || typeof raw.path !== "string" || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(raw.path)) { skipped++; continue; }
      const warnings = Array.isArray(raw.contentWarnings) ? raw.contentWarnings.map(String) : [];
      const tags = [...warnings, section];
      try {
        const rec = makeRecord({
          src: meta.id, k: "character", nid: raw.path, n: raw.name, b: raw.tagline || "", t: tags, c: coverUrl(raw.path),
          nsfw: isNsfwTags(warnings), o: meta.originBase + raw.path,
          p: { tr: "plain", u: cardUrl(raw.path), f: "ccv2png" }, caps: meta.caps, tok: Number(raw.permanentTokens) || null, ts,
        });
        const prev = byId.get(rec.id);
        if (prev) { prev.t = [...new Set([...prev.t, section])]; } else byId.set(rec.id, rec);
      } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
    }
  }
  log(`${meta.id}: ${byId.size} records from ${SECTIONS.length} sections, ${skipped} skipped`);
  return { records: [...byId.values()], errors };
}
