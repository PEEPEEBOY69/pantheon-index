import test from "node:test";
import assert from "node:assert/strict";
import { makeRecord, validateRecord, toHead, applyNsfwGuard, normaliseTags, makeId, truncate, RecordError, LIMITS } from "../crawler/lib/record.mjs";

const base = { src: "chub", k: "character", nid: "12345", n: "Alice", b: "A blurb.", t: ["Fantasy", " elf ", "fantasy"], c: "https://cdn/x.png", nsfw: false, o: "https://chub.ai/characters/a/alice", p: { tr: "plain", u: "https://avatars.charhub.io/avatars/a/alice/chara_card_v2.png", f: "ccv2png" }, caps: { s: "live", i: true, o: true }, tok: 900, ts: 1756700000 };

test("makeId", () => assert.equal(makeId("chub", "character", 12345), "chub:character:12345"));
test("truncate keeps ≤ n chars", () => assert.equal(truncate("abcdef", 3), "abc"));
test("normaliseTags lowercases, trims, dedupes, caps", () => {
  assert.deepEqual(normaliseTags(["Fantasy", " elf ", "fantasy", ""]), ["fantasy", "elf"]);
  assert.equal(normaliseTags(Array.from({ length: 30 }, (_, i) => "t" + i)).length, LIMITS.tags);
  assert.equal(normaliseTags(["x".repeat(50)])[0].length, LIMITS.tagLen);
});
test("makeRecord builds a valid record with id", () => {
  const r = makeRecord(base);
  assert.equal(r.id, "chub:character:12345");
  assert.deepEqual(r.t, ["fantasy", "elf"]);
  assert.equal(validateRecord(r).ok, true);
});
test("makeRecord truncates name and blurb", () => {
  const r = makeRecord({ ...base, n: "n".repeat(500), b: "b".repeat(500) });
  assert.equal(r.n.length, LIMITS.name); assert.equal(r.b.length, LIMITS.blurb);
});
test("makeRecord rejects bad kind / src / https", () => {
  assert.throws(() => makeRecord({ ...base, k: "thing" }), e => e instanceof RecordError && e.code === "kind");
  assert.throws(() => makeRecord({ ...base, src: "Bad Src" }), e => e.code === "src");
  assert.throws(() => makeRecord({ ...base, c: "http://insecure/x.png" }), e => e.code === "url");
  assert.throws(() => makeRecord({ ...base, n: "" }), e => e.code === "name");
});
test("link-only records have p.tr null and caps.i false", () => {
  const r = makeRecord({ ...base, p: null, caps: { s: "index", i: false, o: true } });
  assert.deepEqual(r.p, { tr: null, u: null, f: null });
  assert.equal(validateRecord(r).ok, true);
});
test("validateRecord catches import without payloadRef", () => {
  const r = makeRecord(base); r.p = { tr: null, u: null, f: null };
  const v = validateRecord(r); assert.equal(v.ok, false); assert.ok(v.errors.some(e => e.includes("caps.i")));
});
test("toHead projects the browsing fields, including ts and tok so rows can be sorted without the payload", () => {
  const rec = makeRecord(base);
  assert.deepEqual(toHead(rec), { id: "chub:character:12345", n: "Alice", t: ["fantasy", "elf"], k: "character", nsfw: false, c: "https://cdn/x.png", ts: rec.ts, tok: rec.tok });
  assert.equal(typeof rec.ts, "number", "a head can be sorted by date without fetching the record");
});
test("applyNsfwGuard nulls blurb only when nsfw", () => {
  assert.equal(applyNsfwGuard(makeRecord(base)).b, "A blurb.");
  assert.equal(applyNsfwGuard(makeRecord({ ...base, nsfw: true })).b, null);
});
