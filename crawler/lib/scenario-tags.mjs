// Richer tags for the Perchance RP scenarios (Pantheon spec 2026-11-02 §30). The published set carries at most six tags
// a scenario and spells some of them two ways ("slice-of-life" beside "slice of life"). Pantheon folds the spellings and
// adds its own from these word lists, read over the title, blurb, setting and opening: a tag only when two different
// words of its list come up, or one of them three times, so a stray word is never a tag (checked by hand on 30 of the
// 723, 2026-11-02). The source's own tags stay first; twenty in all at most.
// A word ending in * matches any word it starts (galax* is galaxy and galaxies); the rest match whole words only.
export const SCENARIO_TAG_RULES = [
  ["space", ["starship*", "spaceship*", "space station", "galax*", "orbit*", "planet*", "asteroid*"]],
  ["sci-fi", ["alien*", "android*", "robot*", "laser*", "cybernetic*", "hyperspace", "starship*"]],
  ["cyberpunk", ["cyberpunk", "megacorp*", "neon", "implant*", "netrunner*", "hacker*"]],
  ["post-apocalyptic", ["apocalyp*", "wasteland*", "fallout", "irradiated", "ruined world"]],
  ["horror", ["horror*", "haunt*", "ghost*", "eldritch", "monster*", "undead", "zombie*", "corpse*"]],
  ["magic", ["magic*", "spell*", "sorcer*", "wizard*", "witch*", "mage", "mages", "arcane", "enchant*"]],
  ["dragons", ["dragon*", "wyvern*", "drake", "drakes"]],
  ["medieval", ["kingdom*", "castle*", "knight*", "feudal", "peasant*", "duke*", "baron*"]],
  ["school", ["academy", "school", "schools", "classroom*", "student*", "teacher*", "dormitor*", "campus"]],
  ["detective", ["detective*", "murder*", "investigat*", "clue", "clues", "suspect*", "crime scene"]],
  ["war", ["war", "wars", "army", "armies", "soldier*", "battlefield*", "invasion", "frontline*"]],
  ["isekai", ["isekai", "reincarnat*", "another world", "summoned to", "transported to"]],
  ["heist", ["heist*", "thief", "thieves", "steal", "stealing", "vault", "vaults", "robbery"]],
  ["politics", ["throne*", "noble", "nobles", "nobility", "council*", "politic*", "succession", "crown"]],
  ["exploration", ["explor*", "expedition*", "ruins", "uncharted", "frontier*"]],
  ["pirates", ["pirate*", "privateer*", "buccaneer*", "galleon*"]],
  ["superheroes", ["superhero*", "superpower*", "vigilante*", "masked hero"]],
  ["survival", ["surviv*", "scaveng*", "starving", "supplies", "shelter"]],
  ["romance", ["romanc*", "lover", "lovers", "kiss*", "dating", "courtship"]],
];
const stEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ST_RULES = SCENARIO_TAG_RULES.map(([tag, words]) => [tag, new RegExp("\\b(?:" + words.map(w => (w.endsWith("*") ? stEsc(w.slice(0, -1)) + "\\w*" : stEsc(w))).join("|") + ")\\b", "gi")]);
const stFold = t => String(t || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").slice(0, 30);

export function enrichScenarioTags(s) {
  const out = [];
  for (const t of Array.isArray(s && s.tags) ? s.tags : []) { const f = stFold(t); if (f && !out.includes(f)) out.push(f); }
  const text = [s && s.title, s && s.blurb, s && s.overview, s && s.intro].filter(v => typeof v === "string").join("\n");
  for (const [tag, re] of ST_RULES) {
    if (out.length >= 20) break;
    if (out.includes(tag)) continue;
    // Two different words of the list, or one word three times: a repeated stray word ("crown, crown") is not a tag.
    const hits = text.match(re) || []; const distinct = new Set(hits.map(h => h.toLowerCase())).size;
    if (distinct >= 2 || hits.length >= 3) out.push(tag);
  }
  return out.slice(0, 20);
}
