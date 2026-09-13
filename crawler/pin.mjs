// Writes the commit the index files live at into index/manifest.json, so the client can read every
// file from an immutable ref instead of the branch (jsDelivr caches branch paths long after the
// branch moved; the query string never reaches it). The crawler commits the index first, then runs
// this with that commit's sha, then commits the manifest on top: the sha names a commit whose files
// are byte-for-byte the ones the manifest hashes.
import fs from "node:fs/promises"; import path from "node:path"; import { fileURLToPath } from "node:url";
export function pinManifest(text, sha) {
  const s = String(sha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(s)) throw new Error("pin: not a commit sha: " + JSON.stringify(sha));
  const m = JSON.parse(text);
  m.commit = s;
  return JSON.stringify(m, null, 1);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const sha = process.argv[2]; const file = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index", "manifest.json");
  const out = pinManifest(await fs.readFile(file, "utf8"), sha);
  await fs.writeFile(file, out);
  console.log("pinned " + path.relative(process.cwd(), file) + " to " + sha.slice(0, 12));
}
