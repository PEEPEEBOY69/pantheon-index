// Bronya Rand's Character Bot Archive (GitHub Pages, CORS *): ~84 bot pages, each linking a V2 card JSON + PNG, and a
// World & Lore Books page linking SillyTavern world-info JSON files. Static HTML — no API, so we read the anchors.
import { makeRecord, RecordError } from "../lib/record.mjs";
import { characterFromCard, lorebookFromStWi, detectFormat, estimateTokens, isNsfwTags } from "../lib/normalise.mjs";

export const meta = {
  id: "bronya-rand", label: "Bronya Rand's Archive", kinds: ["character", "lorebook"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  base: "https://bronya-rand.github.io/reimagined-couscous/",
  probe: "https://bronya-rand.github.io/reimagined-couscous/bot-list",
};
const NAV = new Set(["", "bot-list", "commissions", "extras", "world-lore-books", "feed.xml", "about"]);
export function botSlugs(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/href="\/reimagined-couscous\/([a-z0-9-]+)"/g)) if (!NAV.has(m[1])) out.add(m[1]);
  return [...out];
}
export function pageTitle(html) { const h = /<h1[^>]*>([^<]+)<\/h1>/.exec(String(html)); if (h) return h[1].trim(); const t = /<title>([^<|]+)/.exec(String(html)); return t ? t[1].trim() : ""; }
const encodeBrackets = u => u.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
export function fileLinks(html, pageUrl) {
  const out = [];
  for (const m of String(html).matchAll(/href="([^"]+\.(json|png))"/gi)) { try { const u = new URL(m[1].replace(/ /g, "%20"), pageUrl); if (u.hostname === "bronya-rand.github.io") out.push({ href: encodeBrackets(u.toString()), ext: m[2].toLowerCase(), text: "" }); } catch { /* skip */ } }
  return out;
}
export function bookLinks(html, pageUrl) {
  const out = [];
  for (const m of String(html).matchAll(/<a href="([^"]+\.json)">([^<]+)<\/a>/g)) { try { out.push({ href: encodeBrackets(new URL(m[1].replace(/ /g, "%20"), pageUrl).toString()), text: m[2].trim() }); } catch { /* skip */ } }
  return out;
}

export async function crawl(fetcher, { ts, limits = { bots: 150, books: 120 }, log = () => {} }) {
  // ids this crawl chose not to produce -- variants of cards that are also here -- so merge drops
  // them now rather than in thirty days
  const retire = [];
  const nidOf = link => decodeURIComponent(new URL(link.href).pathname.replace("/reimagined-couscous/", ""));
  const errors = []; const byId = new Map(); let skipped = 0;
  const bookPage = meta.base + "world-lore-books"; const listPage = meta.base + "bot-list";
  try {
    const { body } = await fetcher.text(bookPage);
    for (const link of bookLinks(body, bookPage).slice(0, limits.books)) {
      try {
        const { body: obj } = await fetcher.json(link.href); const lb = lorebookFromStWi(obj); if (!lb) { skipped++; continue; }
        const nid = new URL(link.href).pathname.replace("/reimagined-couscous/", "");
        byId.set("l:" + nid, makeRecord({ src: meta.id, k: "lorebook", nid, n: link.text || lb.name, b: lb.description || `${lb.entries.length} entries`, t: ["world info", ...(lb.tags || [])], c: null, nsfw: false, o: bookPage, p: { tr: "plain", u: link.href, f: "stwi" }, caps: meta.caps, tok: estimateTokens(lb), ts }));
      } catch (e) { if (e instanceof RecordError) skipped++; else errors.push({ url: link.href, message: String(e.message || e) }); }
    }
  } catch (e) { errors.push({ url: bookPage, message: String(e.message || e) }); }
  try {
    const { body } = await fetcher.text(listPage);
    for (const slug of botSlugs(body).slice(0, limits.bots)) {
      const pageUrl = meta.base + slug;
      try {
        const { body: html } = await fetcher.text(pageUrl); const title = pageTitle(html); const links = fileLinks(html, pageUrl);
        // The archive publishes two or three files per character -- "Melina.json", "Melina (no
        // scenario).json", sometimes "(chat)" -- and every one of them was a card of its own, so the
        // whole source showed twice (Cash, 2026-09-12). A variant of a card that is also here is not
        // a second card; the primary is the one without the suffix.
        const jsonLinks = links.filter(l => l.ext === "json");
        const primaries = new Set(jsonLinks.map(l => l.href.replace(/\.json$/i, "").toLowerCase()));
        // "Veliona (no scenario A).json" is the variant of "Veliona A.json"; the letter is the card.
        const isVariant = l => {
          const plain = decodeURIComponent(l.href);
          const m = /^(.*?) \((?:no scenario(?: ([a-z]))?|chat)\)\.json$/i.exec(plain);
          if (!m) return false;
          const primary = (m[1] + (m[2] ? " " + m[2] : "")).toLowerCase();
          return primaries.has(encodeURI(primary).toLowerCase()) || primaries.has(primary);
        };
        for (const l of jsonLinks.filter(isVariant)) retire.push("bronya-rand:character:" + nidOf(l));
        for (const link of jsonLinks.filter(l => !isVariant(l))) {
          try {
            const { body: obj } = await fetcher.json(link.href); if (detectFormat(obj) !== "ccv2json") { skipped++; continue; }
            const card = characterFromCard(obj); if (!card) { skipped++; continue; }
            const png = links.find(l => l.ext === "png" && l.href.replace(/\.png$/i, "") === link.href.replace(/\.json$/i, ""));
            const nid = decodeURIComponent(new URL(link.href).pathname.replace("/reimagined-couscous/", ""));
            byId.set("c:" + nid, makeRecord({ src: meta.id, k: "character", nid, n: card.name || title, b: card.blurb || "", t: card.tags || [], c: png ? png.href : null, nsfw: isNsfwTags(card.tags || []), o: pageUrl, p: { tr: "plain", u: link.href, f: "ccv2json" }, caps: meta.caps, tok: estimateTokens(card), ts }));
          } catch (e) { if (e instanceof RecordError) skipped++; else errors.push({ url: link.href, message: String(e.message || e) }); }
        }
      } catch (e) { errors.push({ url: pageUrl, message: String(e.message || e) }); }
    }
  } catch (e) { errors.push({ url: listPage, message: String(e.message || e) }); }
  log(`${meta.id}: ${byId.size} records, ${skipped} skipped, ${errors.length} errors`);
  return { records: [...byId.values()], errors, retire };
}
