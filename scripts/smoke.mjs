#!/usr/bin/env node
// Live shape checks. Network. Exit 1 on the first broken assumption so the adapter that depends on it gets fixed.
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { get } from "../crawler/lib/pathlang.mjs";
const f = createFetcher({ minIntervalMs: 300, retries: 1 });
const checks = [
  ["chub search shape", "https://api.chub.ai/search?namespace=characters&first=2", b => Array.isArray(get(b, "data.nodes")) && typeof get(b, "data.nodes[].fullPath")[0] === "string"],
  ["chub lorebooks shape", "https://api.chub.ai/search?namespace=lorebooks&first=2", b => Array.isArray(get(b, "data.nodes"))],
  // FictionLab is Cloudflare-challenged for non-browser clients (measured 2026-09-01, residential and datacenter).
  // Recorded as crawl:false; the plugin reaches it via superFetch. Here: PASS on the expected 403, FAIL if it ever answers JSON with a changed shape.
  ["fictionlab (expect 403 challenge)", "https://fictionlab.ai/api/search?version=2&keyw=&size=2&searchType=scenarios&sortType=trending&time=all_time&page=0&mature=false", b => Array.isArray(get(b, "results|data.results|scenarios")), { expectStatus: 403 }],
  ["perchance rp blob", "https://user.uploads.dev/file/4bae8c63c1b8a8f0485e27e30737dc44.json", b => Array.isArray(b) && b.length >= 700 && b[0].title && b[0].cardImage],
  ["huggingface datasets", "https://huggingface.co/api/datasets?search=character%20card&limit=2", b => Array.isArray(b) && b[0] && b[0].id],
  ["github search", "https://api.github.com/search/repositories?q=topic:character-cards&per_page=1", b => Array.isArray(b.items)],
  ["character tavern sections", "https://character-tavern.com/api/homepage/sections", b => Array.isArray(b.trending) && typeof get(b, "trending[].path")[0] === "string" && Number.isFinite(b.trending[0].permanentTokens)],
  ["aicharactercards listing", "https://api.aicharactercards.com/api/cards?page=1&limit=1", b => Array.isArray(b.data) && b.data[0] && typeof b.data[0].imageUrl === "string" && Number.isFinite(get(b, "pagination.total"))],
  ["risu realm list", "https://sv.risuai.xyz/realm/" + encodeURIComponent("search== __shared&&page==0&&nsfw==false&&sort==downloads&&web==web") + "?cache=30", b => Array.isArray(b.cards) && b.cards.length > 0 && typeof b.cards[0].id === "string"],
  ["botbooru listing", "https://botbooru.com/posts/?page=1&per_page=1&sort=latest", b => Array.isArray(b.posts) && b.posts[0] && typeof b.posts[0].character_name === "string" && Number.isFinite(b.total)],
  ["bronya rand world info", "https://bronya-rand.github.io/reimagined-couscous/world-info/HSR.json", b => b && typeof b.entries === "object"],
];
let failed = 0;
for (const [name, url, ok, opts = {}] of checks) {
  try { const { body } = await f.json(url, { headers: url.includes("api.github.com") ? { accept: "application/vnd.github+json" } : {} }); const pass = Boolean(ok(body)); console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) failed++; }
  catch (e) {
    if (opts.expectStatus && e.status === opts.expectStatus) { console.log(`PASS  ${name} (HTTP ${e.status} as expected)`); continue; }
    console.log(`FAIL  ${name}: ${e.message}`); failed++;
  }
}
process.exit(failed ? 1 : 0);
