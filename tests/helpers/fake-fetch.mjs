// Returns a fetchImpl that answers by URL prefix. routes: [{ match: string|RegExp, status?, headers?, body, kind?: "json"|"text"|"bytes" }]
export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const route = routes.find(r => (r.match instanceof RegExp ? r.match.test(String(url)) : String(url).startsWith(r.match)));
    if (!route) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    if (route.throws) throw route.throws;
    const kind = route.kind || (typeof route.body === "string" ? "text" : route.body instanceof Uint8Array ? "bytes" : "json");
    const headers = { ...(route.headers || {}) };
    let body;
    if (kind === "json") { body = JSON.stringify(route.body); headers["content-type"] ||= "application/json"; }
    else if (kind === "text") { body = route.body; headers["content-type"] ||= "text/html"; }
    else { body = route.body; headers["content-type"] ||= "application/octet-stream"; }
    return new Response(body, { status: route.status ?? 200, headers });
  };
  impl.calls = calls;
  return impl;
}
