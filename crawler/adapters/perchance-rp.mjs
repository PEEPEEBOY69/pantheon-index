// The published Perchance RP scenario set: one ~10 MB JSON array on user.uploads.dev (723 records,
// measured 2026-08-21; keys measured 2026-09-01). Third-party upload — mirror the *index*, not the file.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { scenarioFromPerchanceRp, isNsfwTags, estimateTokens } from "../lib/normalise.mjs";

export const meta = {
  id: "perchance-rp", label: "Perchance RP scenarios", kinds: ["scenario"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  blobUrl: "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json",
  probe: "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json",
  originBase: "https://perchance.org/ai-rpg#",
};

export async function crawl(fetcher, { ts, log = () => {} }) {
  const errors = []; const records = [];
  let body;
  try { ({ body } = await fetcher.json(meta.blobUrl)); } catch (e) { return { records, errors: [{ message: String(e.message || e) }] }; }
  if (!Array.isArray(body)) return { records, errors: [{ message: "blob is not an array" }] };
  let skipped = 0;
  for (const raw of body) {
    const s = scenarioFromPerchanceRp(raw);
    if (!s || !raw.id) { skipped++; continue; }
    try {
      records.push(makeRecord({
        src: meta.id, k: "scenario", nid: raw.id, n: s.title, b: s.blurb, t: s.tags, c: s.cover, nsfw: isNsfwTags(s.tags),
        o: meta.originBase + encodeURIComponent(String(raw.id)),
        p: { tr: "index", u: meta.blobUrl, f: "prp" }, caps: meta.caps, tok: estimateTokens(s), ts,
      }));
    } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
  }
  log(`${meta.id}: ${records.length} records, ${skipped} skipped`);
  return { records, errors };
}
