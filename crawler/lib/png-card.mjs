// Character cards travel as PNGs with the JSON in a tEXt chunk: keyword "chara" (V2) or "ccv3" (V3), base64.
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
  return null;
}
