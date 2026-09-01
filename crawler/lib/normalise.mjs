// Source formats → the §5.1 payload shapes. Pure functions, no I/O. Vendored into the hub in Phase 2.
const str = v => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = v => (Array.isArray(v) ? v : []);
const NSFW_TAGS = new Set(["nsfw", "adult", "18+", "explicit", "erotic", "smut", "mature", "lewd"]);
export const isNsfwTags = tags => arr(tags).some(t => NSFW_TAGS.has(String(t).trim().toLowerCase()));

function entryFrom(e, i) {
  if (!e || typeof e !== "object") return null;
  const keys = arr(e.keys ?? e.key ?? e.triggers).map(str).filter(Boolean);
  const content = str(e.content);
  if (!content && keys.length === 0) return null;
  return {
    title: str(e.name || e.comment || e.title || (keys[0] ?? `entry ${i + 1}`)),
    keys, secondary_keys: arr(e.secondary_keys ?? e.keysecondary).map(str).filter(Boolean),
    content, enabled: e.enabled !== undefined ? Boolean(e.enabled) : !e.disable,
    constant: Boolean(e.constant), position: e.position ?? null,
    insertion_order: Number.isFinite(e.insertion_order) ? e.insertion_order : Number.isFinite(e.order) ? e.order : i,
  };
}
function bookFrom(b) {
  if (!b || typeof b !== "object") return null;
  const raw = Array.isArray(b.entries) ? b.entries : b.entries && typeof b.entries === "object" ? Object.values(b.entries) : [];
  const entries = raw.map(entryFrom).filter(Boolean);
  return { name: str(b.name), description: str(b.description), entries };
}

export function characterFromCard(card) {
  if (!card || typeof card !== "object") return null;
  const d = card.data && typeof card.data === "object" ? card.data : card;
  const name = str(d.name).trim();
  if (!name) return null;
  return {
    name, description: str(d.description), personality: str(d.personality), scenario: str(d.scenario),
    first_mes: str(d.first_mes), mes_example: str(d.mes_example), alternate_greetings: arr(d.alternate_greetings).map(str),
    tags: arr(d.tags).map(str), creator: str(d.creator), creator_notes: str(d.creator_notes),
    avatar: typeof d.avatar === "string" && /^https:/.test(d.avatar) ? d.avatar : null,
    book: bookFrom(d.character_book),
  };
}
export function lorebookFromStWi(obj) { const b = bookFrom(obj); return b && b.entries.length ? { ...b, name: b.name || "World Info" } : null; }
export function lorebookFromChubNode(node) {
  if (!node || typeof node !== "object") return null;
  let src = node;
  if (!Array.isArray(node.entries) && typeof node.content === "string") { try { src = { ...node, ...JSON.parse(node.content) }; } catch { return null; } }
  const b = bookFrom(src); return b && b.entries.length ? { ...b, name: str(node.name) || b.name } : null;
}
export function scenarioFromFictionLab(o) {
  if (!o || typeof o !== "object") return null;
  const entries = [];
  if (str(o.backStory)) entries.push({ title: "Backstory", keys: [], secondary_keys: [], content: str(o.backStory), enabled: true, constant: true, position: null, insertion_order: 0 });
  for (const [i, p] of arr(o.lorePieces).entries()) { const e = entryFrom({ ...p, keys: p.triggers, name: p.title || p.name }, i + 1); if (e) entries.push(e); }
  return { title: str(o.title), blurb: str(o.description), intro: str(o.intro || o.introduction), starters: arr(o.starters).map(str), tags: arr(o.tags).map(str), cover: typeof o.image === "string" ? o.image : null, lore: entries.length ? { name: str(o.title), description: "", entries } : null };
}
export function scenarioFromPerchanceRp(r) {
  if (!r || typeof r !== "object" || !str(r.title)) return null;
  return { title: str(r.title), blurb: str(r.shortDescription), intro: str(r.intro || r.overview), starters: arr(r.starters).map(str), tags: arr(r.tags).map(str), cover: typeof r.cardImage === "string" ? r.cardImage : null, lore: null };
}
export function textOf(p) {
  if (!p) return "";
  const parts = [];
  const push = v => { if (typeof v === "string") parts.push(v); else if (Array.isArray(v)) v.forEach(push); else if (v && typeof v === "object") Object.values(v).forEach(push); };
  push(p); return parts.join("\n");
}
export const estimateTokens = payload => Math.ceil(textOf(payload).length / 4);
export function detectFormat(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.spec === "chara_card_v3") return "ccv3json";
  if (obj.spec === "chara_card_v2" || (obj.data && typeof obj.data === "object" && obj.data.name)) return "ccv2json";
  if (typeof obj.name === "string" && (typeof obj.first_mes === "string" || typeof obj.description === "string")) return "ccv2json";
  if (obj.entries && typeof obj.entries === "object") return "stwi";
  return null;
}
