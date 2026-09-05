import { crc32, deflateSync } from "node:zlib";
const SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type, data) {
  const t = Buffer.from(type, "latin1"); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}
// A 1x1 grey PNG carrying arbitrary tEXt chunks: [[keyword, text], ...]
export function buildPngWithText(texts) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(Buffer.from([0, 128]));
  const parts = [Buffer.from(SIG), chunk("IHDR", ihdr)];
  for (const [k, v] of texts) parts.push(chunk("tEXt", Buffer.concat([Buffer.from(k, "latin1"), Buffer.from([0]), Buffer.from(v, "latin1")])));
  parts.push(chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}

// The same card in a zTXt chunk: keyword, compression method 0, then zlib-compressed text. Character
// Tavern (and anything that re-encodes with pngcrush-style tools) writes cards this way.
export function buildPngWithCompressedText(texts, { type = "zTXt" } = {}) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(Buffer.from([0, 128]));
  const parts = [Buffer.from(SIG), chunk("IHDR", ihdr)];
  for (const [k, v] of texts) {
    const key = Buffer.from(k, "latin1"); const body = deflateSync(Buffer.from(v, "latin1"));
    if (type === "zTXt") parts.push(chunk("zTXt", Buffer.concat([key, Buffer.from([0, 0]), body])));
    // iTXt: keyword \0 compressionFlag compressionMethod language \0 translatedKeyword \0 text
    else parts.push(chunk("iTXt", Buffer.concat([key, Buffer.from([0, 1, 0]), Buffer.from([0]), Buffer.from([0]), body])));
  }
  parts.push(chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}
