// robots.txt, as the crawler reads it (2026-10-15, the sources round). Character Tavern's crawl read its /api/ and
// Bot Booru's read /api/lorebooks while both sites' robots.txt said no; nothing asked. Now every crawler request does.
// The group for our agent if there is one, else "*"; the longest matching rule wins and Allow wins a tie; "*" matches
// anything and a final "$" ends the path. A missing file (404, 410) means no rules; a server error or a network
// failure refuses that host for the run, because not being able to read the rules is not permission.
export function parseRobots(text) {
  const groups = []; let g = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(); const val = line.slice(i + 1).trim();
    if (key === "user-agent") { if (!g || g.rules.length) { g = { agents: [], rules: [] }; groups.push(g); } g.agents.push(val.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && g && val) g.rules.push({ allow: key === "allow", path: val });
  }
  return groups;
}
function ruleMatches(path, rule) {
  const anchored = rule.endsWith("$"); const body = anchored ? rule.slice(0, -1) : rule;
  return new RegExp("^" + body.split("*").map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "")).test(path);
}
export function allowed(groups, agent, path) {
  const a = String(agent).toLowerCase();
  const own = groups.filter(g => g.agents.some(x => x !== "*" && a.startsWith(x)));
  const rules = (own.length ? own : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules);
  let best = null;
  for (const r of rules) {
    if (!ruleMatches(path, r.path)) continue;
    const len = r.path.replace(/\$$/, "").length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
export function createRobots({ fetchImpl = globalThis.fetch, agent = "pantheon-index", ua = agent, timeoutMs = 10000 } = {}) {
  const byOrigin = new Map();
  function rulesFor(origin) {
    if (byOrigin.has(origin)) return byOrigin.get(origin);
    const p = (async () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(origin + "/robots.txt", { headers: { "user-agent": ua }, signal: ctl.signal });
        if (res.status === 404 || res.status === 410) return [];
        if (res.status >= 400) return null;
        return parseRobots(await res.text());
      } catch { return null; } finally { clearTimeout(t); }
    })();
    byOrigin.set(origin, p); return p;
  }
  return {
    async check(url) {
      const u = new URL(url); if (u.pathname === "/robots.txt") return true;
      const rules = await rulesFor(u.origin); if (rules === null) return false;
      return allowed(rules, agent, u.pathname + u.search);
    },
  };
}
