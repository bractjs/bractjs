import { useContext, type AnchorHTMLAttributes, type ReactNode } from "react";
import { NavigationContext, RouterContext } from "../router.tsx";
import { prefetchRoute } from "../prefetch.ts";
import { buildPath } from "../build-path.ts";
import type { RegisteredRoutes, ParamsFor } from "../registry.ts";

// ── Types ──────────────────────────────────────────────────────────────────

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
  prefetch?: "hover" | "none";
  /** Opt in to View Transitions API for this navigation (E1). */
  viewTransition?: boolean;
  children: ReactNode;
};

// ── Component ──────────────────────────────────────────────────────────────

// Feature-detection at module evaluation so every click doesn't repeat it.
const supportsViewTransitions =
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";

export function Link<TTo extends RegisteredRoutes = RegisteredRoutes>({
  to,
  params,
  prefetch = "none",
  viewTransition = false,
  children,
  ...rest
}: LinkProps<TTo>) {
  const navCtx = useContext(NavigationContext);
  const routerCtx = useContext(RouterContext);
  const isLoading = navCtx?.state === "loading";

  // Resolve the final href once: substitute params into a dynamic pattern, or
  // pass an already-built string straight through.
  const href = params ? buildPath(to as string, params as Record<string, string>) : (to as string);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!navCtx) return; // SSR: let browser handle naturally
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();

    if (viewTransition && supportsViewTransitions) {
      (document as Document & { startViewTransition(cb: () => void): void }).startViewTransition(
        () => { void navCtx.navigate(href); },
      );
    } else {
      void navCtx.navigate(href);
    }
  }

  function handleMouseEnter() {
    if (prefetch === "hover" && routerCtx) prefetchRoute(href, routerCtx.manifest);
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      aria-disabled={isLoading || undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
