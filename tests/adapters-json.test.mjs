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

test("the GitHub walk does not spend its file budget on names a card is never stored under", async () => {
  const { NOT_A_CARD } = await import("../crawler/adapters/github-topics.mjs");
  for (const skip of ["package.json", "src/package.json", "tsconfig.json", "tsconfig.build.json", "manifest.json", "plugin.json", "task.json", ".eslintrc.json", "node_modules/x/card.json", ".github/workflows/x.json", "dist/card.json"]) {
    assert.ok(NOT_A_CARD.test(skip), "should skip " + skip);
  }
  for (const keep of ["Seraphina.json", "cards/Melina (no scenario).json", "chars/Eldoria.json", "default_Seraphina.png", "lorebooks/world.json", "card.json"]) {
    assert.ok(!NOT_A_CARD.test(keep), "should keep " + keep);
  }
});
