import test from "node:test";
import assert from "node:assert/strict";
import { classifyBody, sweepSource } from "../crawler/lib/sweep.mjs";
import { createFetcher } from "../crawler/lib/fetch.mjs";
import { fakeFetch } from "./helpers/fake-fetch.mjs";

test("classifyBody", () => {
  assert.equal(classifyBody(200, new Headers({ "content-type": "application/json" }), "{}"), "json");
  assert.equal(classifyBody(200, new Headers({ "content-type": "text/html" }), "<html>Just a moment...</html>"), "challenge");
  assert.equal(classifyBody(403, new Headers(), "cf-chl-bypass"), "challenge");
  assert.equal(classifyBody(200, new Headers({ "content-type": "text/html" }), "<html>ok</html>"), "html");
  assert.equal(classifyBody(500, new Headers(), ""), "error");
});
test("sweepSource records status, cors, kind, ms, and resets consecutiveFailures on success", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: "https://ok/", body: { a: 1 }, headers: { "access-control-allow-origin": "*" } }]) });
  const s = await sweepSource(f, { id: "ok", probe: "https://ok/x", sweep: { consecutiveFailures: 2 } }, { ts: 10 });
  assert.equal(s.status, 200); assert.equal(s.cors, true); assert.equal(s.kind, "json"); assert.equal(s.at, 10); assert.equal(s.consecutiveFailures, 0); assert.ok(Number.isFinite(s.ms));
});
test("sweepSource increments consecutiveFailures on challenge/error and never throws", async () => {
  const f = createFetcher({ minIntervalMs: 0, retries: 0, fetchImpl: fakeFetch([{ match: "https://bad/", status: 403, body: "Just a moment", kind: "text" }]) });
  const s = await sweepSource(f, { id: "bad", probe: "https://bad/x", sweep: { consecutiveFailures: 1 } }, { ts: 10 });
  assert.equal(s.kind, "challenge"); assert.equal(s.consecutiveFailures, 2); assert.equal(s.cors, false);
  const t = await sweepSource(f, { id: "none", probe: "https://none/x" }, { ts: 10 }); assert.equal(t.kind, "error"); assert.equal(t.consecutiveFailures, 1);
});
test("sweepSource without probe → skipped", async () => {
  const s = await sweepSource(null, { id: "x" }, { ts: 1 }); assert.equal(s.kind, "skipped");
});
