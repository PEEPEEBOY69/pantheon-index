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
