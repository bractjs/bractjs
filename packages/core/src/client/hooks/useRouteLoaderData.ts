import type { LoaderData } from "../../shared/route-types.ts";
import { useMatches } from "./useMatches.ts";

/**
 * React Router's `useRouteLoaderData(routeId)`: the loader data of any route
 * in the current match chain, by id. Ids are app-relative module paths —
 * `"root.tsx"`, `"routes/blog/layout.tsx"`, `"routes/blog/[id].tsx"` — and the
 * extension may be omitted (`"root"`, `"routes/blog/layout"`). Returns
 * `undefined` when that route isn't currently matched.
 *
 * ```tsx
 * const { user } = useRouteLoaderData<typeof rootLoader>("root")!;
 * ```
 */
export function useRouteLoaderData<T = unknown>(routeId: string): LoaderData<T> | undefined {
  const matches = useMatches();
  const want = stripExt(routeId);
  const match = matches.find((m) => m.id === routeId || stripExt(m.id) === want);
  return match?.data as LoaderData<T> | undefined;
}

function stripExt(id: string): string {
  return id.replace(/\.(tsx|ts|jsx|js)$/, "");
}
