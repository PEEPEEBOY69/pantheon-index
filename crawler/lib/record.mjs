// The one record envelope every source collapses into (spec §5). Short field names on purpose.
export const KINDS = ["character", "lorebook", "scenario"];
export const FORMATS = ["ccv2png", "ccv2json", "ccv3json", "stwi", "chublore", "fl", "prp", "hubjson"];
export const TRANSPORTS = ["plain", "super", "index"];
export const LIMITS = { name: 100, blurb: 300, tags: 20, tagLen: 30, url: 300 };

export class RecordError extends Error {
  constructor(code, message) { super(message); this.name = "RecordError"; this.code = code; }
}

export const truncate = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
export const makeId = (src, k, nid) => `${src}:${k}:${String(nid)}`;

export function normaliseTags(arr) {
  const out = [];
  for (const raw of Array.isArray(arr) ? arr : []) {
    const t = String(raw ?? "").trim().toLowerCase().slice(0, LIMITS.tagLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

const isHttps = u => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u) && u.length <= LIMITS.url;

export function makeRecord(input) {
  const { src, k, nid, n, b, t, c, nsfw, o, p, caps, tok, ts } = input;
  if (!KINDS.includes(k)) throw new RecordError("kind", `bad kind ${k}`);
  if (typeof src !== "string" || !/^[a-z0-9-]{1,40}$/.test(src)) throw new RecordError("src", `bad src ${src}`);
  if (nid === undefined || nid === null || String(nid) === "") throw new RecordError("nid", "missing native id");
  const name = truncate(n, LIMITS.name).trim();
  if (!name) throw new RecordError("name", "missing name");
  if (c !== null && c !== undefined && !isHttps(c)) throw new RecordError("url", `cover must be https: ${c}`);
  if (typeof o !== "string" || !isHttps(o)) throw new RecordError("url", `origin must be https: ${o}`);
  let payload = { tr: null, u: null, f: null };
  if (p && p.tr) {
    if (!TRANSPORTS.includes(p.tr)) throw new RecordError("transport", `bad transport ${p.tr}`);
    if (!isHttps(p.u)) throw new RecordError("url", `payload url must be https: ${p.u}`);
    if (!FORMATS.includes(p.f)) throw new RecordError("format", `bad format ${p.f}`);
    payload = { tr: p.tr, u: p.u, f: p.f };
  }
  const cap = { s: caps?.s === "live" ? "live" : "index", i: Boolean(caps?.i), o: caps?.o !== false };
  return {
    id: makeId(src, k, nid), k, src, n: name,
    b: b === null ? null : truncate(b ?? "", LIMITS.blurb),
    t: normaliseTags(t), c: c ?? null, nsfw: Boolean(nsfw), o,
    p: payload, caps: cap,
    tok: Number.isFinite(tok) ? Math.max(0, Math.round(tok)) : null,
    ts: Number.isFinite(ts) ? Math.round(ts) : Math.floor(Date.now() / 1000),
  };
}

export function validateRecord(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: ["not an object"] };
  if (typeof r.id !== "string" || r.id.split(":").length < 3) errors.push("id");
  if (!KINDS.includes(r.k)) errors.push("k");
  if (typeof r.src !== "string") errors.push("src");
  if (typeof r.n !== "string" || !r.n || r.n.length > LIMITS.name) errors.push("n");
  if (!(r.b === null || (typeof r.b === "string" && r.b.length <= LIMITS.blurb))) errors.push("b");
  if (!Array.isArray(r.t) || r.t.length > LIMITS.tags) errors.push("t");
  if (!(r.c === null || isHttps(r.c))) errors.push("c");
  if (typeof r.nsfw !== "boolean") errors.push("nsfw");
  if (!isHttps(r.o)) errors.push("o");
  if (!r.p || !("tr" in r.p)) errors.push("p");
  else if (r.p.tr !== null && (!TRANSPORTS.includes(r.p.tr) || !isHttps(r.p.u) || !FORMATS.includes(r.p.f))) errors.push("p.fields");
  if (!r.caps || !["live", "index"].includes(r.caps.s)) errors.push("caps.s");
  if (r.caps && r.caps.i && (!r.p || r.p.tr === null)) errors.push("caps.i without payloadRef");
  if (!(r.tok === null || Number.isFinite(r.tok))) errors.push("tok");
  if (!Number.isFinite(r.ts)) errors.push("ts");
  return { ok: errors.length === 0, errors };
}

export const toHead = r => ({ id: r.id, n: r.n, t: r.t, k: r.k, nsfw: r.nsfw, c: r.c });
export const applyNsfwGuard = r => (r.nsfw ? { ...r, b: null } : { ...r });
