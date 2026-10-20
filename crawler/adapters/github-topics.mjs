// Public repos tagged character-cards / character-card / lorebook. Free API (60/h anon, 1000/h with GITHUB_TOKEN in Actions).
import { makeRecord, RecordError } from "../lib/record.mjs";
import { parseCardPng } from "../lib/png-card.mjs";
import { characterFromCard, lorebookFromStWi, detectFormat, estimateTokens, isNsfwTags } from "../lib/normalise.mjs";

export const NOT_A_CARD = /(^|\/)(package(-lock)?|tsconfig(\.[\w-]+)?|jsconfig|composer|manifest|plugin|task|fount|common|bun|deno|renovate|lerna|nx|turbo|eslint(rc)?|prettier(rc)?|babel(rc)?|vercel|netlify|firebase|app|settings|config)\.json$|(^|\/)\.[^/]*\.json$|(^|\/)(node_modules|\.github|dist|build|test|tests|__tests__|coverage)\//i;
export const meta = {
  id: "github", label: "GitHub card repos", kinds: ["character", "lorebook"], status: "live", transport: "crawler",
  caps: { s: "index", i: true, o: true },
  topics: ["character-cards", "character-card", "lorebook", "sillytavern", "tavern-cards", "character-ai", "chub", "world-info", "silly-tavern", "sillytavern-characters", "tavernai", "character-chat", "waifu", "chatbot-characters", "roleplay", "worldinfo", "sillytavern-cards", "risuai", "character-book"],
  // Plenty of card repos never set a topic at all, so search their names too. Read at 2026-09-05:
  // topics alone found 222 records across three topics.
  searches: ["sillytavern characters in:name,description", "tavern character cards in:name,description", "character cards collection in:name,description", "lorebook in:name,description worldinfo", "character card v2 in:name,description", "sillytavern presets cards in:name,description", "ai character bots in:name,description", "chara card in:name,description", "world info lorebooks in:name,description", "tavern bots in:name,description"],
  probe: "https://api.github.com/search/repositories?q=topic:character-cards&per_page=1",
};
// A card PNG is its own picture, so it doubles as the cover — but only when it is small enough
// to be a grid thumbnail. Anything bigger stays coverless rather than making the grid crawl.
const COVER_MAX = 600 * 1024;
const MAX_FILE = 2 * 1024 * 1024;
// An app (30+ source files) keeps its cards in folders named for them; a repo named for cards is a collection, whatever else it holds.
const SOURCE_FILE = /\.(js|mjs|cjs|ts|tsx|jsx|py|vue|svelte|go|rs|java|cs|cpp|c|h|rb|php|kt|swift|dart|lua)$/i;
const APP_SOURCE_FILES = 30;
const CARDISH_DIR = /(^|\/)[^/]*(char|card|bot|persona|lore|world|preset|tavern|chub)[^/]*\//i;
const CARDISH_REPO = /(char|card|bot|persona|lore|world)/i;
// The searches find ~1,006 repos (2026-10-20) and only the first maxRepos are read, so the order matters: card-like
// words in the name count most, then in the description and topics; stars break ties; forks and archives fall back.
export function repoScore(r) {
  const name = String(r.name || r.full_name || "").toLowerCase();
  const text = `${String(r.description || "").toLowerCase()} ${(r.topics || []).join(" ").toLowerCase()}`;
  const words = /(character|chara\b|cards?\b|lorebook|world.?info|persona|bots?\b|tavern|chub|risu)/;
  let s = 0; if (words.test(name)) s += 20; if (words.test(text)) s += 10;
  s += Math.log10(1 + (Number(r.stargazers_count) || 0)); if (r.fork) s -= 15; if (r.archived) s -= 2;
  return s;
}

export async function crawl(fetcher, { ts, token = process.env.GITHUB_TOKEN, limits = {}, log = () => {}, deadline = Infinity }) {
  const { repos: maxRepos = 600, filesPerRepo = 300, files: fileBudget = 6000 } = limits || {};
  const headers = { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const errors = []; const byId = new Map(); const repos = new Map(); let spent = 0;
  const queries = [...meta.topics.map(t => "topic:" + t), ...(meta.searches || [])];
  for (const topic of queries) {
    try {
      const { body } = await fetcher.json(`https://api.github.com/search/repositories?q=${encodeURIComponent(topic).replace(/%3A/g, ":").replace(/%2C/g, ",")}&sort=updated&per_page=100`, { headers });
      for (const r of body?.items || []) if (r && r.full_name && !repos.has(r.full_name)) repos.set(r.full_name, r);
    } catch (e) { errors.push({ topic, message: String(e.message || e) }); }
  }
  // 2026-10-20: two passes. A night read 265 repos and 127 were apps (SillyTavern forks, tools) whose PNGs are UI art
  // and whose JSON is config, and they took two thirds of the file budget. So every repo's tree is read first (API
  // calls, not budget); then every collection's files and the card-like folders of the apps; then, with what budget is
  // left, the apps' other files. Nothing that fit the budget before is skipped, it is only read later.
  const first = []; const later = []; const perRepo = new Map();
  for (const r of [...repos.values()].sort((a, b) => repoScore(b) - repoScore(a)).slice(0, maxRepos)) {
    if (Date.now() > deadline) { log(`${meta.id}: past the crawl deadline, stopping before the trees of the rest`); break; }
    const branch = r.default_branch || "main";
    try {
      const { body } = await fetcher.json(`https://api.github.com/repos/${r.full_name}/git/trees/${branch}?recursive=1`, { headers });
      const blobs = (body?.tree || []).filter(f => f.type === "blob");
      // Names a card is never stored under. The detector already refuses these once fetched; skipping
      // them here spends none of the per-crawl file budget on them (194 of 520 records from this
      // source were package.json before the detector was tightened, 2026-09-10).
      const files = blobs.filter(f => f.size <= MAX_FILE && /\.(png|json)$/i.test(f.path) && !NOT_A_CARD.test(f.path));
      const isApp = blobs.filter(f => SOURCE_FILE.test(f.path)).length >= APP_SOURCE_FILES && !CARDISH_REPO.test(r.name || r.full_name);
      // A JSON card's portrait usually sits beside it under the same name (alice.json, alice.png): its cover (2026-10-20).
      const images = new Map(); for (const b of blobs) { const m = /^(.*)\.(png|jpe?g|webp)$/i.exec(b.path); if (m && b.size <= COVER_MAX) images.set(m[1].toLowerCase(), `https://raw.githubusercontent.com/${r.full_name}/${branch}/${b.path}`); }
      for (const f of files) { const cover = /\.json$/i.test(f.path) ? images.get(f.path.replace(/\.json$/i, "").toLowerCase()) || null : null; (isApp && !CARDISH_DIR.test(f.path) ? later : first).push({ r, branch, f, cover }); }
      log(`${meta.id}: ${r.full_name} → ${files.length} files${isApp ? " (an app)" : ""}`);
    } catch (e) { errors.push({ repo: r.full_name, message: String(e.message || e) }); }
  }
  for (const { r, branch, f, cover } of [...first, ...later]) {
    if (spent >= fileBudget) { log(`${meta.id}: file budget ${fileBudget} spent, stopping`); break; }
    if (Date.now() > deadline) { log(`${meta.id}: past the crawl deadline, stopping with ${byId.size} records`); break; }
    const n = perRepo.get(r.full_name) || 0; if (n >= filesPerRepo) continue;
    perRepo.set(r.full_name, n + 1); spent++;
    const url = `https://raw.githubusercontent.com/${r.full_name}/${branch}/${f.path}`;
    const origin = `https://github.com/${r.full_name}/blob/${branch}/${f.path}`;
    const nid = `${r.full_name}/${f.path}`;
    try {
      let obj, format;
      if (/\.png$/i.test(f.path)) { obj = parseCardPng((await fetcher.bytes(url)).body); format = obj ? "ccv2png" : null; }
      else { obj = (await fetcher.json(url)).body; format = detectFormat(obj); }
      if (!obj || !format) continue;
      if (format === "stwi") {
        const lb = lorebookFromStWi(obj); if (!lb) continue;
        byId.set(`github:lorebook:${nid}`, makeRecord({ src: meta.id, k: "lorebook", nid, n: lb.name, b: lb.description || `${lb.entries.length} entries`, t: r.topics, c: null, nsfw: isNsfwTags(r.topics), o: origin, p: { tr: "plain", u: url, f: "stwi" }, caps: meta.caps, tok: estimateTokens(lb), ts }));
      } else {
        const c = characterFromCard(obj); if (!c) continue;
        byId.set(`github:character:${nid}`, makeRecord({ src: meta.id, k: "character", nid, n: c.name, b: c.creator_notes || c.description, t: c.tags.length ? c.tags : r.topics, c: c.avatar || (format === "ccv2png" && f.size <= COVER_MAX ? url : null) || cover, nsfw: isNsfwTags(c.tags), o: origin, p: { tr: "plain", u: url, f: format }, caps: meta.caps, tok: estimateTokens(c), ts }));
      }
    } catch (e) { if (!(e instanceof RecordError)) errors.push({ file: url, message: String(e.message || e) }); }
  }
  return { records: [...byId.values()], errors };
}
