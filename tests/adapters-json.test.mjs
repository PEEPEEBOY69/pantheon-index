import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAdapter } from "../crawler/lib/adapters-runtime.mjs";
for (const f of fs.readdirSync("crawler/adapters").filter(x => x.endsWith(".json"))) {
  test(`adapter ${f} validates`, () => {
    const a = JSON.parse(fs.readFileSync(`crawler/adapters/${f}`, "utf8"));
    const v = validateAdapter(a); assert.equal(v.ok, true, v.errors.join(", "));
    assert.equal(a.id + ".json", f, "file name must equal adapter id");
  });
}
