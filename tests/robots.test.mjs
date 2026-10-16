// robots.txt in the crawler (2026-10-15, the sources round): Character Tavern's and Bot Booru's rules were being read
// past; now every crawler request asks first.
import test from "node:test"; import assert from "node:assert/strict";
import { parseRobots, allowed, createRobots } from "../crawler/lib/robots.mjs";
const CT = "User-agent: *\nAllow: /api/account/avatar/\nDisallow: /api/\nDisallow: /chat/\nSitemap: https://x/sitemap.xml\n";
test("groups, the agent match, longest rule, Allow on a tie, * and $", () => {
  const r = parseRobots(CT);
  assert.equal(allowed(r, "pantheon-index", "/api/homepage/sections"), false);
  assert.equal(allowed(r, "pantheon-index", "/api/account/avatar/1"), true, "the longer Allow wins");
  assert.equal(allowed(r, "pantheon-index", "/character/a/b"), true);
  const own = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: pantheon-index\nDisallow: /private\n");
  assert.equal(allowed(own, "pantheon-index", "/public"), true, "our own group replaces *");
  assert.equal(allowed(own, "other-bot", "/public"), false);
  const tie = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a\n"); assert.equal(allowed(tie, "x", "/a"), true);
  const wild = parseRobots("User-agent: *\nDisallow: /*.json$\nDisallow: /q/*/edit\n");
  assert.equal(allowed(wild, "x", "/a/b.json"), false); assert.equal(allowed(wild, "x", "/a/b.json?x=1"), true, "$ ends the path");
  assert.equal(allowed(wild, "x", "/q/1/edit/now"), false);
  assert.equal(allowed(parseRobots(""), "x", "/anything"), true);
  const bb = parseRobots("User-agent: *\nAllow: /$\nDisallow: /post/\nDisallow: /api/\n");
  assert.equal(allowed(bb, "x", "/posts/?offset=0"), true, "/post/ is not a prefix of /posts/");
  assert.equal(allowed(bb, "x", "/api/lorebooks?offset=0"), false);
  const empty = parseRobots("User-agent: *\nDisallow:\n"); assert.equal(allowed(empty, "x", "/a"), true, "an empty Disallow allows everything");
  const named = parseRobots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n");
  assert.equal(allowed(named, "pantheon-index", "/x"), true, "rules for other named crawlers do not apply to ours");
  const dollar = parseRobots("User-agent: *\nDisallow: /a$b\n"); assert.equal(allowed(dollar, "x", "/a$b/c"), false, "a $ inside a rule is a character");
});
test("createRobots: read once per host; 404 means no rules; a server error refuses for the run", async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(String(url)); if (String(url).startsWith("https://a/")) return new Response(CT, { status: 200 }); if (String(url).startsWith("https://b/")) return new Response("no", { status: 404 }); return new Response("down", { status: 503 }); };
  const rb = createRobots({ fetchImpl, agent: "pantheon-index" });
  assert.equal(await rb.check("https://a/api/x"), false); assert.equal(await rb.check("https://a/character/x"), true);
  assert.equal(calls.filter(u => u === "https://a/robots.txt").length, 1, "cached per host");
  assert.equal(await rb.check("https://b/anything"), true);
  assert.equal(await rb.check("https://c/anything"), false, "an unreadable robots.txt is not permission");
  assert.equal(await rb.check("https://a/robots.txt"), true, "the file itself is always readable");
  const thrower = createRobots({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(await thrower.check("https://d/x"), false, "a network failure is not permission either");
});
