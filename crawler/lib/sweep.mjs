// Reachability sweep (spec §7): what a datacenter IP actually gets from each source, recorded, never guessed.
import { FetchError } from "./fetch.mjs";
const CHALLENGE = /just a moment|cf-chl|challenge-platform|attention required|enable javascript and cookies|ddos-guard/i;

export function classifyBody(status, headers, text) {
  const ct = (headers && headers.get && headers.get("content-type")) || "";
  if (CHALLENGE.test(text || "") || status === 403 || status === 503 || status === 429) return "challenge";
  if (status >= 400 || status === 0) return "error";
  if (/json/i.test(ct)) return "json";
  if (/html/i.test(ct)) return "html";
  return "other";
}

export async function sweepSource(fetcher, source, { ts }) {
  const prev = source.sweep || {}; const failures = prev.consecutiveFailures || 0;
  if (!source.probe) return { ...prev, kind: "skipped", at: ts };
  const t0 = Date.now();
  try {
    const res = await fetcher.text(source.probe);
    const kind = classifyBody(res.status, res.headers, res.body);
    const cors = res.headers.get("access-control-allow-origin") === "*" || Boolean(res.headers.get("access-control-allow-origin"));
    const ok = kind === "json" || kind === "html" || kind === "other";
    return { status: res.status, cors, kind, ms: Date.now() - t0, at: ts, consecutiveFailures: ok ? 0 : failures + 1, bytes: res.body ? res.body.length : 0 };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : 0;
    const kind = status ? classifyBody(status, new Headers(), "") : "error";
    return { status, cors: false, kind, ms: Date.now() - t0, at: ts, consecutiveFailures: failures + 1, error: e.code || String(e.message || e) };
  }
}
