import { get, template, mapFields } from "./pathlang.mjs";
import { makeRecord, RecordError, KINDS, FORMATS } from "./record.mjs";
import { isNsfwTags } from "./normalise.mjs";

const REQUIRED_MAP = ["nid", "n", "o"];
export function validateAdapter(a) {
  const errors = [];
  if (!a || typeof a !== "object") return { ok: false, errors: ["not an object"] };
  if (!/^[a-z0-9-]{1,40}$/.test(a.id || "")) errors.push("id");
  if (typeof a.label !== "string") errors.push("label");
  if (!Array.isArray(a.kinds) || !a.kinds.length || !a.kinds.every(k => KINDS.includes(k))) errors.push("kinds");
  if (!["live", "candidate", "probed", "adapted", "blocked", "dead"].includes(a.status)) errors.push("status");
  if (!["plain", "super", "crawler"].includes(a.transport)) errors.push("transport");
  if (!a.caps || !["live", "index"].includes(a.caps.s)) errors.push("caps");
  const s = a.search;
  if (!s || typeof s !== "object") errors.push("search");
  else {
    if (!/^https:\/\//.test(s.url || "")) errors.push("search.url");
    if (!s.params || typeof s.params !== "object") errors.push("search.params");
    if (!Array.isArray(s.controls)) errors.push("search.controls");
    if (typeof s.items !== "string") errors.push("search.items");
    if (!s.map || typeof s.map !== "object") errors.push("search.map");
    else for (const k of REQUIRED_MAP) if (typeof s.map[k] !== "string") errors.push(`map.${k}`);
  }
  if (a.detail && a.detail.format && !FORMATS.includes(a.detail.format)) errors.push("detail.format");
  if (a.crawl && (!Array.isArray(a.crawl.passes) || !Number.isFinite(a.crawl.pages))) errors.push("crawl");
  return { ok: errors.length === 0, errors };
}

export function buildSearchUrl(a, params = {}) {
  const u = new URL(a.search.url);
  for (const [k, v] of Object.entries(a.search.fixed || {})) u.searchParams.set(k, String(v));
  for (const control of a.search.controls) {
    if (!(control in params) || params[control] === undefined || params[control] === "") continue;
    const target = a.search.params[control]; if (!target) continue;
    let v = params[control];
    if (control === "sort" && a.search.sorts && a.search.sorts[v] !== undefined) v = a.search.sorts[v];
    if (Array.isArray(v)) v = v.join(",");
    u.searchParams.set(target, String(v));
  }
  return u.toString();
}

// A declarative adapter can map the source's own date into `ts` (seconds, milliseconds or an ISO
// string — all three appear across these APIs). Without one every record from a nightly crawl shares
// the crawl's timestamp, and "just added" is the same list as everything else.
export function sourceDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v > 1e11 ? v / 1000 : v);
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e8) return Math.floor(n > 1e11 ? n / 1000 : n);
  const parsed = Date.parse(String(v));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
export function itemsToRecords(a, items, { ts }) {
  const records = []; let skipped = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    const m = mapFields(a.search.map, raw);
    const kind = a.kinds[0];
    const tags = Array.isArray(m.t) ? m.t : typeof m.t === "string" ? m.t.split(",") : [];
    const nsfw = m.nsfw === true || m.nsfw === "true" || m.nsfw === 1 || isNsfwTags(tags);
    const pu = m.pu ? String(m.pu) : null;
    try {
      records.push(makeRecord({
        ts: sourceDate(m.ts) || ts,
        src: a.id, k: kind, nid: m.nid, n: m.n, b: m.b, t: tags, c: m.c || null, nsfw, o: m.o,
        p: pu && a.detail ? { tr: a.detail.transport || a.transport, u: pu, f: a.detail.format } : null,
        caps: { s: a.caps.s, i: Boolean(pu && a.detail), o: true },
        tok: Number(m.tok) || null,
      }));
    } catch (e) { if (e instanceof RecordError) skipped++; else throw e; }
  }
  return { records, skipped };
}

export async function crawlDeclarative(a, fetcher, { ts, maxPages = a.crawl?.pages ?? 1, log = () => {} }) {
  const byId = new Map(); const errors = []; let pagesFetched = 0;
  const passes = a.crawl?.passes?.length ? a.crawl.passes : [{}];
  const start = a.crawl?.pageStart ?? 1;
  for (const pass of passes) {
    try {
      for (let page = start; page < start + maxPages; page++) {
        const url = buildSearchUrl({ ...a, search: { ...a.search, fixed: { ...(a.search.fixed || {}), ...(pass.first ? { first: pass.first } : {}) } } }, { ...pass, page });
        const { body } = await fetcher.json(url); pagesFetched++;
        const items = get(body, a.search.items);
        if (!Array.isArray(items) || items.length === 0) break;
        const { records } = itemsToRecords(a, items, { ts });
        for (const r of records) if (!byId.has(r.id)) byId.set(r.id, r);
        log(`${a.id}: pass ${JSON.stringify(pass)} page ${page} → ${records.length}`);
      }
    } catch (e) { errors.push({ pass, message: String(e && e.message || e) }); }
  }
  return { records: [...byId.values()], errors, pagesFetched };
}
