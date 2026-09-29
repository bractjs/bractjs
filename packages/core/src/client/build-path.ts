// Substitute `:name` segments in a colon-style route pattern with param values.
//
// Mirrors the substitution `bractjs codegen` bakes into the generated `routes`
// builder (`src/codegen/route-codegen.ts`). The framework's own `<Link>` /
// `useNavigate` can't import that app-local generated object, so they share this
// helper instead. Values are URL-encoded; an absent param leaves its `:name`
// segment intact (surfaced as an obviously-wrong URL rather than silently dropped).
//
// Patterns without a `:` (static routes, or already-built hrefs) pass straight
// through, so this is safe to call unconditionally.
export function buildPath(pattern: string, params: Record<string, string | number>): string {
  if (!pattern.includes(":")) return pattern;
  return pattern
    .split("/")
    .map((seg) => {
      if (!seg.startsWith(":")) return seg;
      const value = params[seg.slice(1)];
      return value === undefined ? seg : encodeURIComponent(String(value));
    })
    .join("/");
}

/**
 * React Router's `generatePath()` / `href()`: fill a route pattern with params.
 * Supports `:name`, optional `:name?` (the segment is dropped when absent) and
 * a trailing splat `*` (`params["*"]`, inserted unencoded so it can span
 * segments). A missing required param throws — as in React Router.
 */
export function generatePath(
  pattern: string,
  params: Record<string, string | number | null | undefined> = {},
): string {
  const segments = pattern.split("/").flatMap((seg): string[] => {
    if (seg === "*") {
      const splat = params["*"];
      return splat === undefined || splat === null ? [] : [String(splat).replace(/^\/+/, "")];
    }
    if (!seg.startsWith(":")) return [seg];
    const optional = seg.endsWith("?");
    const name = seg.slice(1, optional ? -1 : undefined);
    const value = params[name];
    if (value === undefined || value === null) {
      if (optional) return [];
      throw new Error(`[bractjs] generatePath: missing ":${name}" param for "${pattern}"`);
    }
    return [encodeURIComponent(String(value))];
  });
  const path = segments.join("/");
  return path.startsWith("/") || !pattern.startsWith("/") ? path || "/" : "/" + path;
}
