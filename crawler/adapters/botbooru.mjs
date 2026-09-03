// Botbooru: the gallery's own JSON (found in /js/ui.js, 2026-09-02). Listing /posts/?offset&limit=24&sort (page is ignored), detail /post/{id}
// with every card field, lorebooks under /api/lorebooks. No CORS on any of it → the plugin imports through super-fetch;
// images at /images/{filename} are hotlinked for covers. The visible set is ~3,300 posts and ~140 lorebooks.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "botbooru", label: "Botbooru", kinds: ["character", "lorebook"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  base: "https://botbooru.com", perPage: 100,
  probe: "https://botbooru.com/posts/?offset=0&limit=1&sort=latest",
};
export const DEFAULT_LIMITS = { pages: 400, lorebookPages: 20, passes: [{ sort: "latest", sfw_only: "0" }, { sort: "downloads", time_window: "all", sfw_only: "0" }] };
export function tagNames(tags) { return Array.isArray(tags) ? tags.map(t => (t && typeof t === "object" ? t.name : t)).filter(x => typeof x === "string" && x).map(x => x.replace(/_/g, " ")) : []; }
export function postRecord(raw, ts) {
  const tags = tagNames(raw.tags); const lowered = tags.map(t => t.toLowerCase());
  return makeRecord({ src: meta.id, k: "character", nid: raw.id, n: raw.character_name, b: raw.tagline || raw.description_excerpt || raw.creator_notes_excerpt || "", t: tags.filter(t => !["sfw", "nsfw"].includes(t.toLowerCase())), c: raw.filename ? meta.base + "/images/" + raw.filename : null, nsfw: lowered.includes("nsfw") || (!lowered.includes("sfw") && isNsfwTags(tags)), o: meta.base + "/character/" + raw.id, p: { tr: "super", u: meta.base + "/post/" + raw.id, f: "bbjson" }, caps: meta.caps, tok: Number(raw.token_count) || null, ts });
}
export function lorebookRecord(raw, ts) {
  return makeRecord({ src: meta.id, k: "lorebook", nid: "lb" + raw.id, n: raw.title, b: raw.tagline || raw.uploader_tagline || (raw.entry_count ? raw.entry_count + " entries" : ""), t: ["lorebook", raw.content_rating || ""].filter(Boolean), c: raw.cover_image_filename ? meta.base + "/images/" + raw.cover_image_filename : null, nsfw: raw.content_rating === "nsfw", o: meta.base + "/lorebooks/" + (raw.slug || raw.number || raw.id), p: { tr: "super", u: meta.base + "/api/lorebooks/" + (raw.number || raw.id), f: "bblore" }, caps: meta.caps, tok: Number(raw.token_estimate) || null, ts });
}
export async function crawl(fetcher, { ts, limits = DEFAULT_LIMITS, log = () => {} }) {
  const errors = []; const byId = new Map(); let skipped = 0; const pages = limits.pages || DEFAULT_LIMITS.pages; const passes = limits.passes || DEFAULT_LIMITS.passes;
  for (const pass of passes) {
    let total = Infinity;
    for (let page = 1; page <= pages && (page - 1) * meta.perPage < total; page++) {
      const qs = new URLSearchParams({ offset: String((page - 1) * meta.perPage), limit: String(meta.perPage), ...pass });
      let body; try { ({ body } = await fetcher.json(`${meta.base}/posts/?${qs}`, { headers: { accept: "application/json" } })); } catch (e) { errors.push({ pass, page, message: String(e.message || e) }); break; }
      const posts = body && Array.isArray(body.posts) ? body.posts : []; if (Number.isFinite(body && body.total)) total = body.total;
      if (!posts.length) break;
      for (const raw of posts) { if (!raw || !Number.isFinite(raw.id) || byId.has("c" + raw.id)) continue; try { byId.set("c" + raw.id, postRecord(raw, ts)); } catch (e) { if (e instanceof RecordError) skipped++; else throw e; } }
      log(`${meta.id}: ${JSON.stringify(pass)} page ${page}/${Math.ceil(total / meta.perPage)} → ${posts.length}`);
    }
  }
  let lbTotal = Infinity;
  for (let page = 1; page <= (limits.lorebookPages || DEFAULT_LIMITS.lorebookPages) && (page - 1) * meta.perPage < lbTotal; page++) {
    let body; try { ({ body } = await fetcher.json(`${meta.base}/api/lorebooks?offset=${(page - 1) * meta.perPage}&limit=${meta.perPage}`, { headers: { accept: "application/json" } })); } catch (e) { errors.push({ lorebooks: page, message: String(e.message || e) }); break; }
    const items = body && Array.isArray(body.items) ? body.items : []; if (Number.isFinite(body && body.total)) lbTotal = body.total; if (!items.length) break;
    for (const raw of items) { if (!raw || !Number.isFinite(raw.id) || byId.has("l" + raw.id)) continue; try { byId.set("l" + raw.id, lorebookRecord(raw, ts)); } catch (e) { if (e instanceof RecordError) skipped++; else throw e; } }
  }
  log(`${meta.id}: ${byId.size} records, ${skipped} skipped, ${errors.length} errors`);
  return { records: [...byId.values()], errors };
}
