// Aggregator lists are crawled to discover *sources*, not cards (spec §7.1 C). New hosts enter sources.json as candidates.
export const SOURCES = [
  { id: "rentry-charcard-list", url: "https://rentry.org/charcardrentrylist/raw" },
  { id: "rentry-meta-bot-list", url: "https://rentry.org/meta_bot_list/raw" },
  { id: "blocky-character-card-list", url: "https://blocky-mint.github.io/character-card-list/" },
];
// Suffix-matched: "jsdelivr.net" also drops "cdn.jsdelivr.net". Infra, social, page-theme boilerplate,
// and the aggregators themselves (a list linking to itself is not a discovery).
const IGNORE = [
  "github.com", "githubusercontent.com", "github.io", "google.com", "googleapis.com", "gstatic.com", "googletagmanager.com",
  "youtube.com", "youtu.be", "discord.gg", "discord.com", "reddit.com", "twitter.com", "x.com", "t.co", "imgur.com",
  "wikipedia.org", "schema.org", "w3.org", "jsdelivr.net", "cloudflare.com", "cloudflareinsights.com", "jquery.com",
  "realfavicongenerator.net", "browsehappy.com", "jekyllrb.com", "mademistakes.com", "creativecommons.org", "patreon.com",
  "ko-fi.com", "buymeacoffee.com", "example.com", "example", "rentry.org", "rentry.co", "neocities.org",
];
export const isIgnoredHost = host => !host || !host.includes(".") || /^link-to-|whatever/.test(host) || IGNORE.some(d => host === d || host.endsWith("." + d));

export function extractHosts(text) {
  const out = [];
  for (const m of String(text).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/\s"'<>)\]]|$)/gi)) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (!isIgnoredHost(host) && !out.includes(host)) out.push(host);
  }
  return out;
}

export async function discover(fetcher, registry, { ts }) {
  const known = new Set(registry.flatMap(s => s.hosts || []));
  const found = new Map(); const errors = [];
  for (const src of SOURCES) {
    try {
      const { body } = await fetcher.text(src.url);
      for (const host of extractHosts(body)) {
        if (known.has(host)) continue;
        const entry = found.get(host) || { host, discoveredFrom: [], ts };
        if (!entry.discoveredFrom.includes(src.id)) entry.discoveredFrom.push(src.id);
        found.set(host, entry);
      }
    } catch (e) { errors.push({ aggregator: src.id, message: String(e.message || e) }); }
  }
  return { candidates: [...found.values()], errors };
}
