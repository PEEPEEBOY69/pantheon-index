#!/usr/bin/env node
// One source's crawl against the live site, through the crawler's own gated fetcher, written nowhere (the sources
// round, 2026-10-15). Prints what it found, the errors, and every request robots.txt refused.
//   node scripts/dry-run.mjs risu-realm
//   node scripts/dry-run.mjs botbooru '{"pages":3}'
//   node scripts/dry-run.mjs --probes        (every live source's probe URL through the gate)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFetcher, FetchError } from "../crawler/lib/fetch.mjs";
import { crawlDeclarative, validateAdapter } from "../crawler/lib/adapters-runtime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const crawler = path.join(here, "..", "crawler");
const sources = JSON.parse(await fs.readFile(path.join(crawler, "sources.json"), "utf8"));
const refused = [];
const inner = createFetcher({ robots: true });
// Count refusals without changing what the adapter sees.
const fetcher = Object.fromEntries(["json", "text", "bytes", "head"].map(k => [k, async (url, opts) => {
  try { return await inner[k](url, opts); } catch (e) { if (e instanceof FetchError && e.code === "robots") refused.push(url); throw e; }
}]));

if (process.argv[2] === "--probes") {
  for (const s of sources.filter(x => x.status === "live" && x.probe)) {
    try { const r = await fetcher.text(s.probe); console.log(`${s.id}: ${r.status} ${s.probe}`); }
    catch (e) { console.log(`${s.id}: ${e.code || "error"} ${s.probe} (${e.message})`); }
  }
  console.log(`refused by robots.txt: ${refused.length}`); for (const u of refused) console.log("  " + u);
  process.exit(0);
}

const id = process.argv[2]; const limits = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;
const s = sources.find(x => x.id === id); if (!s || !s.adapter) { console.error(`no adapter for ${id}`); process.exit(2); }
const file = path.join(crawler, "adapters", s.adapter); const t0 = Date.now();
let res;
if (s.adapter.endsWith(".json")) { const a = JSON.parse(await fs.readFile(file, "utf8")); const v = validateAdapter(a); if (!v.ok) throw new Error(v.errors.join(",")); res = await crawlDeclarative(a, fetcher, { ts: Math.floor(Date.now() / 1000), log: () => {}, deadline: Date.now() + 30 * 60 * 1000 }); }
else { const mod = await import(pathToFileURL(file).href); res = await mod.crawl(fetcher, { ts: Math.floor(Date.now() / 1000), limits, log: () => {} }); }
const kinds = {}; for (const r of res.records) kinds[r.k] = (kinds[r.k] || 0) + 1;
console.log(`${id}: ${res.records.length} records ${JSON.stringify(kinds)} in ${Math.round((Date.now() - t0) / 1000)} s; ${res.errors.length} errors; ${refused.length} refused by robots.txt`);
for (const e of res.errors.slice(0, 5)) console.log("  error: " + JSON.stringify(e).slice(0, 200));
for (const u of refused.slice(0, 5)) console.log("  refused: " + u);
