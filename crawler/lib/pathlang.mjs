// The adapter path language (spec §6). Deliberately tiny; no evaluation, no code.
//   a.b.c      nested property
//   a[]        map over array
//   a[].b      pluck b from each element (flattens one level if b is an array)
//   x|y        first alternative that is non-empty
//   {field}    inside a template string: raw substitution from the object
const isEmpty = v => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function walk(obj, segments) {
  let cur = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (cur === null || cur === undefined) return undefined;
    if (seg.endsWith("[]")) {
      const key = seg.slice(0, -2);
      const arr = key === "" ? cur : cur[key];
      if (!Array.isArray(arr)) return undefined;
      const rest = segments.slice(i + 1);
      if (rest.length === 0) return arr;
      const out = [];
      for (const el of arr) {
        const v = walk(el, rest);
        if (Array.isArray(v)) out.push(...v); else if (v !== undefined) out.push(v);
      }
      return out;
    }
    if (typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}

export function get(obj, path) {
  if (typeof path !== "string" || path === "") return undefined;
  for (const alt of path.split("|")) {
    const v = walk(obj, alt.trim().split("."));
    if (!isEmpty(v)) return v;
  }
  return undefined;
}

export function template(str, obj) {
  return String(str).replace(/\{([^}]+)\}/g, (_, p) => {
    const v = get(obj, p);
    return v === undefined || v === null ? "" : String(v);
  });
}

export function mapFields(map, raw) {
  const out = {};
  for (const [k, expr] of Object.entries(map)) {
    if (typeof expr !== "string") continue;
    out[k] = expr.includes("{") ? template(expr, raw) : get(raw, expr);
  }
  return out;
}
