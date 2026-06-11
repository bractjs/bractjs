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
export function buildPath(
  pattern: string,
  params: Record<string, string | number>,
): string {
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
