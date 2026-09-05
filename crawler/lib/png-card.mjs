// Character cards travel as PNGs with the JSON in a text chunk: keyword "chara" (V2) or "ccv3" (V3),
// base64. The chunk is often tEXt, but tools that re-encode write zTXt (zlib-compressed) instead —
// Character Tavern serves those, and reading only tEXt made a perfectly good card look like "not a
// character card PNG" (2026-09-05).
import { inflateSync } from "node:zlib";
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function readPngTextChunks(bytes) {
  const out = new Map();
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || SIG.some((b, i) => bytes[i] !== b)) return out;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off); const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const dataStart = off + 8, dataEnd = dataStart + len;
    if (dataEnd + 4 > bytes.length) break;
    if (type === "tEXt") {
      const nul = bytes.indexOf(0, dataStart);
      if (nul > 0 && nul < dataEnd) {
        const key = Buffer.from(bytes.subarray(dataStart, nul)).toString("latin1");
        out.set(key, Buffer.from(bytes.subarray(nul + 1, dataEnd)).toString("latin1"));
      }
    }
    if (type === "IEND") break;
    off = dataEnd + 4;
  }
  return out;
}

export function readPngCompressedChunks(bytes) {
  const out = new Map();
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || SIG.some((b, i) => bytes[i] !== b)) return out;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off); const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const start = off + 8, end = start + len;
    if (end + 4 > bytes.length) break;
    if (type === "zTXt" || type === "iTXt") {
      const nul = bytes.indexOf(0, start);
      if (nul > 0 && nul < end) {
        const key = Buffer.from(bytes.subarray(start, nul)).toString("latin1");
        if (type === "zTXt") { if (bytes[nul + 1] === 0) out.set(key, bytes.subarray(nul + 2, end)); }
        else {
          const flag = bytes[nul + 1]; const method = bytes[nul + 2];
          const langEnd = bytes.indexOf(0, nul + 3);
          const transEnd = langEnd > 0 ? bytes.indexOf(0, langEnd + 1) : -1;
          if (flag === 1 && method === 0 && transEnd > 0 && transEnd < end) out.set(key, bytes.subarray(transEnd + 1, end));
        }
      }
    }
    if (type === "IEND") break;
    off = end + 4;
  }
  return out;
}
export function parseCardPng(bytes) {
  const chunks = readPngTextChunks(bytes);
  for (const key of ["ccv3", "chara"]) {
    const v = chunks.get(key);
    if (!v) continue;
    try {
      const json = Buffer.from(v, "base64").toString("utf8");
      const obj = JSON.parse(json);
      if (obj && typeof obj === "object") return obj;
    } catch { /* fall through to next key */ }
  }
  for (const key of ["ccv3", "chara"]) {
    const raw = readPngCompressedChunks(bytes).get(key); if (!raw) continue;
    let text = null; try { text = inflateSync(Buffer.from(raw)).toString("latin1"); } catch { text = null; }
    if (!text) continue;
    for (const parse of [() => JSON.parse(Buffer.from(text, "base64").toString("utf8")), () => JSON.parse(text)]) {
      try { const o = parse(); if (o && typeof o === "object") return o; } catch { /* try the other */ }
    }
  }
  return null;
}
