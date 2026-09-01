import test from "node:test";
import assert from "node:assert/strict";
import { readPngTextChunks, parseCardPng } from "../crawler/lib/png-card.mjs";
import { buildPngWithText } from "./helpers/png.mjs";

const card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Alice", description: "d", tags: ["a"] } };
const b64 = Buffer.from(JSON.stringify(card), "utf8").toString("base64");

test("reads tEXt chunks", () => {
  const m = readPngTextChunks(buildPngWithText([["chara", b64], ["Comment", "hi"]]));
  assert.equal(m.get("Comment"), "hi"); assert.equal(m.get("chara"), b64);
});
test("parseCardPng decodes chara → object", () => assert.deepEqual(parseCardPng(buildPngWithText([["chara", b64]])), card));
test("prefers ccv3 chunk when present", () => {
  const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { name: "V3" } };
  const png = buildPngWithText([["chara", b64], ["ccv3", Buffer.from(JSON.stringify(v3)).toString("base64")]]);
  assert.equal(parseCardPng(png).spec, "chara_card_v3");
});
test("not a PNG → null; PNG without card → null; bad base64 → null", () => {
  assert.equal(parseCardPng(new Uint8Array([1, 2, 3])), null);
  assert.equal(parseCardPng(buildPngWithText([])), null);
  assert.equal(parseCardPng(buildPngWithText([["chara", "!!!notbase64"]])), null);
});
