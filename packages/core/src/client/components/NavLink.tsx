import { type CSSProperties, type ReactNode, useContext } from "react";
import { useLocation } from "../hooks/useLocation.ts";
import { useResolveTo } from "../hooks/useResolveTo.ts";
import { type PathObject, parseTo } from "../nav-utils.ts";
import type { RegisteredRoutes } from "../registry.ts";
import { NavigationContext } from "../router.tsx";
import { Link, type LinkProps } from "./Link.tsx";

/** State `className` / `style` / `children` functions receive. */
export interface NavLinkRenderProps {
  isActive: boolean;
  isPending: boolean;
  isTransitioning: boolean;
}

export type NavLinkProps<TTo extends RegisteredRoutes = RegisteredRoutes> = Omit<
  LinkProps<TTo>,
  "className" | "style" | "children"
> & {
  /** Only active on an exact match — not for descendant paths. `to="/"` is always exact. */
  end?: boolean;
  /** Match the pathname case-sensitively. */
  caseSensitive?: boolean;
  className?: string | ((state: NavLinkRenderProps) => string | undefined);
  style?: CSSProperties | ((state: NavLinkRenderProps) => CSSProperties | undefined);
  children?: ReactNode | ((state: NavLinkRenderProps) => ReactNode);
};

function matches(pathname: string, target: string, end: boolean, caseSensitive: boolean): boolean {
  const norm = (p: string) => {
    const s = p.length > 1 ? p.replace(/\/+$/, "") : p;
    return caseSensitive ? s : s.toLowerCase();
  };
  const cur = norm(pathname);
  const to = norm(target);
  if (cur === to) return true;
  if (end || to === "/") return false;
  return cur.startsWith(to + "/");
}

/**
 * React Router's `<NavLink>`: a `<Link>` that knows whether it points at the
 * current location. Sets `aria-current="page"` and an `active` class when
 * active, `pending` while a navigation to it is loading; `className`, `style`
 * and `children` may be functions of `{ isActive, isPending, isTransitioning }`.
 */
export function NavLink<TTo extends RegisteredRoutes = RegisteredRoutes>({
  end = false,
  caseSensitive = false,
  className,
  style,
  children,
  ...rest
}: NavLinkProps<TTo>) {
  const location = useLocation();
  const navCtx = useContext(NavigationContext);
  // The same resolution <Link> applies, so "active" compares like with like.
  const resolve = useResolveTo();
  const targetPath = parseTo(resolve(rest.to as string | Partial<PathObject>, rest.relative)).pathname;
  const isActive = matches(location.pathname, targetPath, end, caseSensitive);
  const pendingPath = navCtx?.state === "loading" ? navCtx.detail?.location?.pathname : undefined;
  const isPending = pendingPath !== undefined && matches(pendingPath, targetPath, end, caseSensitive);
  const state: NavLinkRenderProps = { isActive, isPending, isTransitioning: false };

  const resolvedClass =
    typeof className === "function"
      ? className(state)
      : [className, isActive ? "active" : null, isPending ? "pending" : null].filter(Boolean).join(" ") ||
        undefined;
  const resolvedStyle = typeof style === "function" ? style(state) : style;
  const resolvedChildren = typeof children === "function" ? children(state) : children;

  return (
    <Link
      {...(rest as LinkProps<TTo>)}
      className={resolvedClass}
      style={resolvedStyle}
      aria-current={isActive ? "page" : undefined}
    >
      {resolvedChildren}
    </Link>
  );
}
