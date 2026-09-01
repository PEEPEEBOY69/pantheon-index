import test from "node:test";
import assert from "node:assert/strict";
import { get, template, mapFields } from "../crawler/lib/pathlang.mjs";

const o = { a: { b: { c: 1 } }, list: [{ n: "x", t: ["p", "q"] }, { n: "y" }], empty: "", nul: null, name: "Al/ice", num: 7 };

test("get: nested property", () => assert.equal(get(o, "a.b.c"), 1));
test("get: missing → undefined", () => assert.equal(get(o, "a.zz.c"), undefined));
test("get: array map []", () => assert.deepEqual(get(o, "list[]"), o.list));
test("get: array pluck []", () => assert.deepEqual(get(o, "list[].n"), ["x", "y"]));
test("get: nested pluck flattens one level", () => assert.deepEqual(get(o, "list[].t"), ["p", "q"]));
test("get: fallback | picks first non-empty", () => {
  assert.equal(get(o, "empty|nul|a.b.c"), 1);
  assert.equal(get(o, "nul|empty"), undefined);
});
test("get: non-object root is safe", () => assert.equal(get(null, "a.b"), undefined));
test("template: substitutes raw values", () => assert.equal(template("https://x/{name}/card.png", o), "https://x/Al/ice/card.png"));
test("template: numbers stringify, missing → empty", () => assert.equal(template("{num}-{nope}", o), "7-"));
test("mapFields: path values vs template values", () => {
  const out = mapFields({ id: "num", n: "name", url: "https://h/{name}", tags: "list[].n" }, o);
  assert.deepEqual(out, { id: 7, n: "Al/ice", url: "https://h/Al/ice", tags: ["x", "y"] });
});
