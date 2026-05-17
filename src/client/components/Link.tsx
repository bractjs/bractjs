import { useContext, type AnchorHTMLAttributes, type ReactNode } from "react";
import { NavigationContext, RouterContext } from "../router.tsx";
import { prefetchRoute } from "../prefetch.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  prefetch?: "hover" | "none";
  /** Opt in to View Transitions API for this navigation (E1). */
  viewTransition?: boolean;
  children: ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────

// Feature-detection at module evaluation so every click doesn't repeat it.
const supportsViewTransitions =
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";

export function Link({ to, prefetch = "none", viewTransition = false, children, ...rest }: LinkProps) {
  const navCtx = useContext(NavigationContext);
  const routerCtx = useContext(RouterContext);
  const isLoading = navCtx?.state === "loading";

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!navCtx) return; // SSR: let browser handle naturally
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();

    if (viewTransition && supportsViewTransitions) {
      (document as Document & { startViewTransition(cb: () => void): void }).startViewTransition(
        () => { void navCtx.navigate(to); },
      );
    } else {
      void navCtx.navigate(to);
    }
  }

  function handleMouseEnter() {
    if (prefetch === "hover" && routerCtx) prefetchRoute(to, routerCtx.manifest);
  }

  return (
    <a
      href={to}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      aria-disabled={isLoading || undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
