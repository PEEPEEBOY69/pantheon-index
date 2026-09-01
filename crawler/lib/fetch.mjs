export class FetchError extends Error {
  constructor(code, message, status = null) { super(message); this.name = "FetchError"; this.code = code; this.status = status; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createFetcher({ ua = "pantheon-index/0.1 (+https://perchance.org/pantheon-hub)", timeoutMs = 15000, retries = 2, backoffMs = 500, minIntervalMs = 250, fetchImpl = globalThis.fetch, extraHeaders = {} } = {}) {
  let last = 0;
  async function raw(url, opts = {}) {
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { ...opts, signal: ctl.signal, headers: { "user-agent": ua, accept: "*/*", ...extraHeaders, ...(opts.headers || {}) } });
        clearTimeout(timer);
        if (res.status >= 500 && attempt < retries) { await sleep(backoffMs * (attempt + 1)); continue; }
        if (res.status >= 400) throw new FetchError("http", `HTTP ${res.status} ${url}`, res.status);
        return res;
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof FetchError) throw e;
        const isAbort = e && (e.name === "AbortError" || /abort/i.test(String(e.message)));
        if (attempt < retries && !isAbort) { await sleep(backoffMs * (attempt + 1)); continue; }
        throw new FetchError(isAbort ? "timeout" : "network", `${isAbort ? "timeout" : "network"} ${url}: ${e && e.message}`);
      }
    }
  }
  const pack = async (res, body) => ({ status: res.status, headers: res.headers, body });
  return {
    async json(url, opts) { const r = await raw(url, opts); let b; try { b = await r.json(); } catch { throw new FetchError("parse", `bad JSON ${url}`); } return pack(r, b); },
    async text(url, opts) { const r = await raw(url, opts); return pack(r, await r.text()); },
    async bytes(url, opts) { const r = await raw(url, opts); return pack(r, new Uint8Array(await r.arrayBuffer())); },
    async head(url, opts) { const r = await raw(url, { ...opts, method: "HEAD" }); return pack(r, null); },
  };
}
