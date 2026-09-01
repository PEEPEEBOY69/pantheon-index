import test from "node:test";
import assert from "node:assert/strict";
import { createFetcher, FetchError } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";

test("json(): parses and returns status/headers/body", async () => {
  const impl = fakeFetch([{ match: "https://a/", body: { ok: 1 }, headers: { "access-control-allow-origin": "*" } }]);
  const f = createFetcher({ fetchImpl: impl, minIntervalMs: 0 });
  const r = await f.json("https://a/x");
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: 1 }); assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(impl.calls[0].opts.headers["user-agent"].startsWith("pantheon-index/"), true);
});
test("http error throws FetchError with status", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: "https://a/", status: 503, body: "down" }]), retries: 0, minIntervalMs: 0 });
  await assert.rejects(f.text("https://a/x"), e => e instanceof FetchError && e.code === "http" && e.status === 503);
});
test("retries on 5xx then succeeds", async () => {
  let n = 0;
  const impl = async () => (++n < 3 ? new Response("x", { status: 502 }) : new Response("ok", { status: 200 }));
  const f = createFetcher({ fetchImpl: impl, retries: 2, minIntervalMs: 0, backoffMs: 1 });
  assert.equal((await f.text("https://a/")).body, "ok"); assert.equal(n, 3);
});
test("does not retry 4xx", async () => {
  let n = 0;
  const impl = async () => { n++; return new Response("no", { status: 404 }); };
  const f = createFetcher({ fetchImpl: impl, retries: 3, minIntervalMs: 0 });
  await assert.rejects(f.text("https://a/")); assert.equal(n, 1);
});
test("timeout → FetchError timeout", async () => {
  const impl = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
  const f = createFetcher({ fetchImpl: impl, timeoutMs: 20, retries: 0, minIntervalMs: 0 });
  await assert.rejects(f.text("https://a/"), e => e.code === "timeout");
});
test("minInterval spaces calls", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: "https://a/", body: "x" }]), minIntervalMs: 30 });
  const t0 = Date.now(); await f.text("https://a/1"); await f.text("https://a/2");
  assert.ok(Date.now() - t0 >= 30);
});
test("bytes(): returns Uint8Array", async () => {
  const f = createFetcher({ fetchImpl: fakeFetch([{ match: "https://a/", body: new Uint8Array([1, 2, 3]) }]), minIntervalMs: 0 });
  assert.deepEqual(Array.from((await f.bytes("https://a/b")).body), [1, 2, 3]);
});
