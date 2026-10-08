import { useCallback, useContext, useMemo } from "react";
import { BractJSContext, RouteLevelContext } from "../../shared/context.ts";
import { localizePath, splitLocale } from "../../shared/i18n.ts";
import { type PathObject, pathToString, resolveTo, routePathnamesFor } from "../nav-utils.ts";
import { RouterContext } from "../router.tsx";
import { useLocation } from "./useLocation.ts";

/** React Router's `relative` option: climb routes (default) or URL segments. */
export type RelativeRoutingType = "route" | "path";

/** A target the browser resolves itself: another scheme (`mailto:`, `https:`) or `//host`. */
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Turns a link target into the URL to use: absolute and external targets unchanged. */
export type ResolveToFn = (to: string | Partial<PathObject>, relative?: RelativeRoutingType) => string;

/**
 * Resolve link and form targets the way React Router does: a relative `to`
 * ("edit", "../list", "?page=2") is relative to the ROUTE the calling
 * component renders under — root.tsx, a layout, or the page — not to the
 * URL's last segment. `..` climbs one route (`relative="path"`: one URL
 * segment). Under i18n the result stays in the current locale.
 *
 * Returns a stable function rather than a string: several callers only learn
 * their target at event time (a submitter's `formaction`, `useSubmit` options,
 * `navigate(to)`). SSR-safe; with no matched routes it resolves against the
 * current pathname.
 */
export function useResolveTo(): ResolveToFn {
  const routerCtx = useContext(RouterContext);
  const bractCtx = useContext(BractJSContext);
  const level = useContext(RouteLevelContext);
  const location = useLocation();
  const i18n = routerCtx?.i18n ?? bractCtx?.i18n;
  const matches = routerCtx?.matches ?? bractCtx?.matches;
  const params = routerCtx?.params ?? bractCtx?.params;
  // The SPA shell renders at "/" with no route on the server; resolve against
  // the same thing on the client until the real route has loaded.
  const spaPending = routerCtx?.hydrationPending === "spa";

  // Repeated slashes collapse: on a crafted `//evil.com/x` URL a `?q` / `#h` /
  // `.` target would otherwise resolve to the protocol-relative (off-site)
  // `//evil.com/x…`. The SPA shell resolves against "/" on both sides.
  const raw = spaPending ? "/" : location.pathname.replace(/\/{2,}/g, "/");
  const { pathname: bare, prefix } =
    i18n && !spaPending ? splitLocale(raw, i18n) : { pathname: raw, prefix: null };

  const ids = matches?.map((m) => m.id).join("\n") ?? "";
  const paramsKey = JSON.stringify(params ?? {});
  // Primitive memo deps: the level object's identity says nothing.
  const levelKind = level.kind;
  const levelIndex = level.kind === "layout" ? level.index : -1;
  const routePathnames = useMemo(() => {
    if (spaPending) return ["/"];
    const all = ids ? ids.split("\n") : [];
    if (all.length === 0) return [bare];
    // Cut the chain at the calling component's own module.
    const end =
      levelKind === "root" ? 1 : levelKind === "layout" ? Math.min(all.length, 2 + levelIndex) : all.length;
    return routePathnamesFor(all.slice(0, end), bare, JSON.parse(paramsKey), levelKind === "leaf");
  }, [spaPending, ids, bare, paramsKey, levelKind, levelIndex]);

  return useCallback<ResolveToFn>(
    (to, relative = "route") => {
      if (typeof to === "string") {
        if (to.startsWith("/") || EXTERNAL_RE.test(to)) return to;
      } else if (
        to.pathname !== undefined &&
        (to.pathname.startsWith("/") || EXTERNAL_RE.test(to.pathname))
      ) {
        return pathToString(to);
      }
      const r = resolveTo(to, routePathnames, bare, relative === "path");
      const pathname = prefix && i18n ? localizePath(r.pathname, prefix, i18n) : r.pathname;
      return pathname + r.search + r.hash;
    },
    [routePathnames, bare, prefix, i18n],
  );
}
