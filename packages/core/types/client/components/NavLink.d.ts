import { type CSSProperties, type ReactNode } from "react";
import type { RegisteredRoutes } from "../registry.ts";
import { type LinkProps } from "./Link.tsx";
/** State `className` / `style` / `children` functions receive. */
export interface NavLinkRenderProps {
    isActive: boolean;
    isPending: boolean;
    isTransitioning: boolean;
}
export type NavLinkProps<TTo extends RegisteredRoutes = RegisteredRoutes> = Omit<LinkProps<TTo>, "className" | "style" | "children"> & {
    /** Only active on an exact match — not for descendant paths. `to="/"` is always exact. */
    end?: boolean;
    /** Match the pathname case-sensitively. */
    caseSensitive?: boolean;
    className?: string | ((state: NavLinkRenderProps) => string | undefined);
    style?: CSSProperties | ((state: NavLinkRenderProps) => CSSProperties | undefined);
    children?: ReactNode | ((state: NavLinkRenderProps) => ReactNode);
};
/**
 * React Router's `<NavLink>`: a `<Link>` that knows whether it points at the
 * current location. Sets `aria-current="page"` and an `active` class when
 * active, `pending` while a navigation to it is loading; `className`, `style`
 * and `children` may be functions of `{ isActive, isPending, isTransitioning }`.
 */
export declare function NavLink<TTo extends RegisteredRoutes = RegisteredRoutes>({ end, caseSensitive, className, style, children, ...rest }: NavLinkProps<TTo>): import("react").JSX.Element;
