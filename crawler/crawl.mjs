#!/usr/bin/env node
// Orchestrator: registry → sweep → each live adapter in isolation → merge with previous → shards → manifest.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createFetcher } from "./lib/fetch.mjs";
import { crawlDeclarative, validateAdapter } from "./lib/adapters-runtime.mjs";
import { sweepSource } from "./lib/sweep.mjs";
import { discover, isIgnoredHost } from "./lib/aggregator.mjs";
import { mergeWithPrevious } from "./lib/merge.mjs";
import { writeSourceShards } from "./lib/shard.mjs";
import { buildManifest } from "./lib/manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = s => createHash("sha256").update(s).digest("hex");
const readJson = async (p, fallback) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; } };

async function loadAdapter(file) {
  const full = path.join(here, "adapters", file);
  if (file.endsWith(".json")) { const a = JSON.parse(await fs.readFile(full, "utf8")); const v = validateAdapter(a); if (!v.ok) throw new Error(`adapter ${file}: ${v.errors.join(",")}`); return { kind: "declarative", a, descriptor: a }; }
  const mod = await import(pathToFileURL(full).href);
  return { kind: "code", crawl: mod.crawl, descriptor: { ...mod.meta, search: null } };
}

async function previousRecords(outDir, src) {
  const dir = path.join(outDir, src); let files = [];
  try { files = (await fs.readdir(dir)).filter(f => /^rec-\d{3}\.json$/.test(f)).sort(); } catch { return []; }
  const out = []; for (const f of files) out.push(...(await readJson(path.join(dir, f), [])));
  return out;
}

export async function runCrawl({ outDir, fetcher = createFetcher(), now = Math.floor(Date.now() / 1000), limits = {}, log = console.log, only = null }) {
  await fs.mkdir(outDir, { recursive: true });
  const seed = JSON.parse(await fs.readFile(path.join(here, "sources.json"), "utf8"));
  const prevSources = await readJson(path.join(outDir, "sources.json"), []);
  const prevById = new Map(prevSources.map(s => [s.id, s]));
  const sources = seed.map(s => ({ ...s, sweep: prevById.get(s.id)?.sweep, lastCrawl: prevById.get(s.id)?.lastCrawl }));
  for (const s of prevSources) if (s.discoveredFrom && !sources.find(x => x.id === s.id) && !(s.hosts || []).some(isIgnoredHost)) sources.push(s);
  const errors = []; const manifestSources = {}; const adapters = [];

  for (const s of sources) { s.sweep = await sweepSource(fetcher, s, { ts: now }); log(`sweep ${s.id}: ${s.sweep.kind} ${s.sweep.status ?? ""}`); }

  for (const s of sources.filter(x => x.status === "live" && x.adapter && x.crawl === false)) {
    try { adapters.push((await loadAdapter(s.adapter)).descriptor); log(`adapter ${s.id}: exported, not crawled (crawl:false)`); }
    catch (e) { errors.push({ source: s.id, message: String(e.message || e) }); }
  }
  for (const s of sources.filter(x => x.status === "live" && x.adapter && x.crawl !== false)) {
    let ok = true, fresh = [], errMsg = null, adapterErrors = [];
    const prev = await previousRecords(outDir, s.id);
    if (Array.isArray(only) && !only.includes(s.id)) {
      try { adapters.push((await loadAdapter(s.adapter)).descriptor); } catch (e) { ok = false; errMsg = String(e.message || e); }
      fresh = prev; log(`crawl ${s.id}: kept ${prev.length} previous records (--only)`);
    } else {
      try {
        const ad = await loadAdapter(s.adapter);
        adapters.push(ad.descriptor);
        const res = ad.kind === "declarative" ? await crawlDeclarative(ad.a, fetcher, { ts: now, log }) : await ad.crawl(fetcher, { ts: now, log, limits: limits[s.id] });
        fresh = res.records; adapterErrors = res.errors || [];
        if (fresh.length === 0 && adapterErrors.length) { ok = false; errMsg = adapterErrors[0].message; }
      } catch (e) { ok = false; errMsg = String(e.message || e); }
    }
    const prevSeen = await readJson(path.join(outDir, s.id, "seen.json"), {});
    const { records: merged, seen } = mergeWithPrevious(prev, fresh, { now, crawlOk: ok, prevSeen });
    const written = await writeSourceShards(outDir, s.id, merged);
    await fs.writeFile(path.join(outDir, s.id, "seen.json"), JSON.stringify(seen));
    manifestSources[s.id] = written;
    s.lastCrawl = { at: now, ok, count: merged.length, fresh: fresh.length, error: errMsg, errors: adapterErrors.length };
    if (!ok) errors.push({ source: s.id, message: errMsg });
    log(`crawl ${s.id}: ${ok ? "ok" : "FAILED"} fresh=${fresh.length} total=${merged.length}`);
  }

  const disc = await discover(fetcher, sources, { ts: now });
  for (const c of disc.candidates) if (!sources.find(x => x.hosts?.includes(c.host))) sources.push({ id: c.host.replace(/[^a-z0-9]+/g, "-"), label: c.host, kinds: ["character"], status: "candidate", hosts: [c.host], probe: `https://${c.host}/`, evidence: "aggregator", discoveredFrom: c.discoveredFrom, ts: c.ts });
  errors.push(...disc.errors.map(e => ({ source: "aggregator:" + e.aggregator, message: e.message })));

  const adaptersJson = JSON.stringify(adapters); const sourcesJson = JSON.stringify(sources, null, 1);
  const targetsJson = await fs.readFile(path.join(here, "targets.json"), "utf8");
  await fs.writeFile(path.join(outDir, "adapters.json"), adaptersJson);
  await fs.writeFile(path.join(outDir, "sources.json"), sourcesJson);
  await fs.writeFile(path.join(outDir, "targets.json"), targetsJson);
  const manifest = buildManifest({ builtAt: now, sources: manifestSources, hashes: { "adapters.json": sha256(adaptersJson), "sources.json": sha256(sourcesJson), "targets.json": sha256(targetsJson) } });
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  return { manifest, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outDir = path.resolve(here, "..", "index");
  const onlyArg = process.argv.find(a => a.startsWith("--only=")); const only = onlyArg ? onlyArg.slice(7).split(",").map(s => s.trim()).filter(Boolean) : null;
  runCrawl({ outDir, only }).then(({ manifest, errors }) => {
    console.log(`built ${Object.keys(manifest.sources).length} sources, ${errors.length} errors`);
    for (const e of errors) console.error(`  ${e.source}: ${e.message}`);
    process.exit(0);
  }, e => { console.error(e); process.exit(1); });
}
