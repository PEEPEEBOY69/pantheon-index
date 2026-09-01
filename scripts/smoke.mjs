#!/usr/bin/env node
// Live shape checks. Network. Exit 1 on the first broken assumption so the adapter that depends on it gets fixed.
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { get } from "../crawler/lib/pathlang.mjs";
const f = createFetcher({ minIntervalMs: 300, retries: 1 });
const checks = [
  ["chub search shape", "https://api.chub.ai/search?namespace=characters&first=2", b => Array.isArray(get(b, "data.nodes")) && get(b, "data.nodes[0].fullPath")],
  ["chub lorebooks shape", "https://api.chub.ai/search?namespace=lorebooks&first=2", b => Array.isArray(get(b, "data.nodes"))],
  ["fictionlab shape", "https://fictionlab.ai/api/search?version=2&keyw=&size=2&searchType=scenarios&sortType=trending&time=all_time&page=0&mature=false", b => Array.isArray(get(b, "results|data.results|scenarios"))],
  ["perchance rp blob", "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json", b => Array.isArray(b) && b.length >= 700 && b[0].title && b[0].cardImage],
  ["huggingface datasets", "https://huggingface.co/api/datasets?search=character%20card&limit=2", b => Array.isArray(b) && b[0] && b[0].id],
  ["github search", "https://api.github.com/search/repositories?q=topic:character-cards&per_page=1", b => Array.isArray(b.items)],
];
let failed = 0;
for (const [name, url, ok] of checks) {
  try { const { body } = await f.json(url, { headers: url.includes("api.github.com") ? { accept: "application/vnd.github+json" } : {} }); const pass = Boolean(ok(body)); console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) failed++; }
  catch (e) { console.log(`FAIL  ${name}: ${e.message}`); failed++; }
}
process.exit(failed ? 1 : 0);
