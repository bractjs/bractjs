import { type AnchorHTMLAttributes, type ReactNode, useCallback, useContext, useEffect, useRef } from "react";
import { buildPath } from "../build-path.ts";
import { useResolveTo } from "../hooks/useResolveTo.ts";
import { type PathObject, pathToString, resolveHref, toSamePath } from "../nav-utils.ts";
import { observeOnce, prefetchRoute } from "../prefetch.ts";
import type { ParamsFor, RegisteredRoutes, SearchOutputFor } from "../registry.ts";
import { NavigationContext, RouterContext } from "../router.tsx";
import { withSearch } from "../search-serializer.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * When to prefetch the target route's chunk + loader data:
 * - `"none"` (default) — never.
 * - `"intent"` — on hover/focus, after a short delay (canceled if the pointer
 *   leaves). The best default for most links.
 * - `"hover"` — immediately on mouseenter (legacy alias of intent without the
 *   delay; kept for back-compat).
 * - `"viewport"` — when the link scrolls into view (shared
 *   IntersectionObserver). Good for lists.
 * - `"render"` — as soon as the link mounts.
 */
type PrefetchMode = "none" | "intent" | "hover" | "viewport" | "render";

// `to` accepts any registered route literal (autocomplete + typed `params`) but
// also any string via `(string & {})`, so existing call sites that build the URL
// themselves — `to={`/posts/${slug}`}`, `to={item.href}` — keep compiling. Run
// `bractjs codegen` to register the app's routes and unlock autocomplete; until
// then `RegisteredRoutes` is `string` and this is just today's loose prop.
type LinkProps<TTo extends RegisteredRoutes = RegisteredRoutes> = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  /** Target: a path string, or React Router's `{ pathname, search, hash }` object. */
  to: TTo | (string & {}) | Partial<PathObject>;
  /** Path params for a dynamic `to` (e.g. `params={{ id }}` for `/blog/:id`). */
  params?: ParamsFor<TTo>;
  /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
  search?: Partial<SearchOutputFor<TTo>>;
  prefetch?: PrefetchMode;
  /**
   * Animate this navigation with the View Transitions API: the new page is
   * committed inside `document.startViewTransition`. Ignored where unsupported.
   */
  viewTransition?: boolean;
  /** Replace the current history entry instead of pushing. */
  replace?: boolean;
  /** History state for the new entry, readable via `useLocation().state`. */
  state?: unknown;
  /**
   * When the target's cached loader data is stale, whether to refetch it in
   * the background. Passed to the route's `shouldRevalidate` as
   * `defaultShouldRevalidate`; routes without one follow it (React Router 8).
   */
  defaultShouldRevalidate?: boolean;
  /** React Router 7 name for {@link defaultShouldRevalidate}. */
  unstable_defaultShouldRevalidate?: boolean;
  /** `true` makes the click a full document load (React Router `reloadDocument`). */
  reloadDocument?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  preventScrollReset?: boolean;
  /**
   * How a relative `to` resolves (React Router): against the route this link
   * renders under (`"route"`, default — `..` climbs one route) or the URL's
   * path segments (`"path"` — `..` drops one segment).
   */
  relative?: "route" | "path";
  /** Accepted for React Router compatibility; no effect. */
  discover?: "render" | "none";
  children: ReactNode;
};

export type { LinkProps };

// ── Component ──────────────────────────────────────────────────────────────

/** Hover-intent delay before prefetching — cancels on a fly-by pointer. */
const INTENT_DELAY_MS = 100;

export function Link<TTo extends RegisteredRoutes = RegisteredRoutes>({
  to,
  params,
  search,
  prefetch = "none",
  viewTransition = false,
  replace,
  state,
  defaultShouldRevalidate,
  unstable_defaultShouldRevalidate,
  reloadDocument,
  preventScrollReset: _preventScrollReset,
  relative,
  discover: _discover,
  onClick,
  children,
  ...rest
}: LinkProps<TTo>) {
  const revalidateByDefault = defaultShouldRevalidate ?? unstable_defaultShouldRevalidate;
  const navCtx = useContext(NavigationContext);
  const routerCtx = useContext(RouterContext);
  const isLoading = navCtx?.state === "loading";

  const resolve = useResolveTo();
  // Resolve the final href once: substitute params into a dynamic pattern, or
  // pass an already-built string straight through; resolve a relative target
  // against this link's route (React Router); then apply `search`.
  const toStr = typeof to === "string" || to.pathname !== undefined ? pathToString(to) : null;
  const base = toStr !== null && params ? buildPath(toStr, params as Record<string, string>) : toStr;
  const href = withSearch(
    resolve(base ?? (to as Partial<PathObject>), relative),
    search as Record<string, unknown> | undefined,
  );

  const anchorRef = useRef<HTMLAnchorElement>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPrefetch = useCallback(() => {
    if (routerCtx) void prefetchRoute(href, routerCtx.manifest);
  }, [href, routerCtx]);

  // viewport / render modes register in an effect — SSR renders a plain <a>.
  useEffect(() => {
    if (prefetch === "render") {
      triggerPrefetch();
      return;
    }
    if (prefetch === "viewport" && anchorRef.current) {
      return observeOnce(anchorRef.current, triggerPrefetch);
    }
  }, [prefetch, triggerPrefetch]);

  // Cancel a pending intent timer on unmount.
  useEffect(
    () => () => {
      if (intentTimer.current) clearTimeout(intentTimer.current);
    },
    [],
  );

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // A user onClick runs first and may cancel the navigation (preventDefault).
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!navCtx) return; // SSR: let browser handle naturally
    if (reloadDocument) return; // full document load
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;
    if (rest.target && rest.target !== "_self") return;
    // `href` is already resolved; resolveHref only normalizes what's left.
    const safe = toSamePath(resolveHref(href));
    // SECURITY(high): an off-origin target (https://…, mailto:, javascript:…)
    // is left to the browser's own handling of the <a href>. React has already
    // neutralized a javascript: href there; navigating to it ourselves would
    // run the script in this origin.
    if (safe === null) return;
    e.preventDefault();

    const opts = { replace, state, defaultShouldRevalidate: revalidateByDefault, viewTransition };
    // The router commits the new page inside the View Transition itself, once
    // its data and module are loaded (see client/view-transition.ts).
    void navCtx.navigate(safe, opts);
  }

  function startIntent() {
    if (prefetch !== "intent" || intentTimer.current) return;
    intentTimer.current = setTimeout(() => {
      intentTimer.current = null;
      triggerPrefetch();
    }, INTENT_DELAY_MS);
  }

  function cancelIntent() {
    if (intentTimer.current) {
      clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
  }

  function handleMouseEnter() {
    if (prefetch === "hover") triggerPrefetch();
    else startIntent();
  }

  return (
    <a
      href={href}
      ref={anchorRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelIntent}
      onFocus={startIntent}
      onBlur={cancelIntent}
      onTouchStart={prefetch === "intent" || prefetch === "hover" ? triggerPrefetch : undefined}
      aria-disabled={isLoading || undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
