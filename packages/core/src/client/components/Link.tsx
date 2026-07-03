import { type AnchorHTMLAttributes, type ReactNode, useCallback, useContext, useEffect, useRef } from "react";
import { buildPath } from "../build-path.ts";
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
  to: TTo | (string & {});
  /** Path params for a dynamic `to` (e.g. `params={{ id }}` for `/blog/:id`). */
  params?: ParamsFor<TTo>;
  /** Search params for the target, typed by its `searchSchema` (replaces any query in `to`). */
  search?: Partial<SearchOutputFor<TTo>>;
  prefetch?: PrefetchMode;
  /** Opt in to View Transitions API for this navigation (E1). */
  viewTransition?: boolean;
  /** Replace the current history entry instead of pushing. */
  replace?: boolean;
  children: ReactNode;
};

// ── Component ──────────────────────────────────────────────────────────────

// Feature-detection at module evaluation so every click doesn't repeat it.
const supportsViewTransitions =
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";

/** Hover-intent delay before prefetching — cancels on a fly-by pointer. */
const INTENT_DELAY_MS = 100;

export function Link<TTo extends RegisteredRoutes = RegisteredRoutes>({
  to,
  params,
  search,
  prefetch = "none",
  viewTransition = false,
  replace,
  children,
  ...rest
}: LinkProps<TTo>) {
  const navCtx = useContext(NavigationContext);
  const routerCtx = useContext(RouterContext);
  const isLoading = navCtx?.state === "loading";

  // Resolve the final href once: substitute params into a dynamic pattern, or
  // pass an already-built string straight through; then apply `search`.
  const base = params ? buildPath(to as string, params as Record<string, string>) : (to as string);
  const href = withSearch(base, search as Record<string, unknown> | undefined);

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
    if (!navCtx) return; // SSR: let browser handle naturally
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();

    if (viewTransition && supportsViewTransitions) {
      (document as Document & { startViewTransition(cb: () => void): void }).startViewTransition(() => {
        void navCtx.navigate(href, { replace });
      });
    } else {
      void navCtx.navigate(href, { replace });
    }
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
