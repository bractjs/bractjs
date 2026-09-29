import { type ReactElement } from "react";
/**
 * React Router's `useOutletContext()`: the `context` prop of the nearest
 * parent `<Outlet context={…}>` — how a layout shares state with the routes it
 * renders without prop drilling or a hand-made React context.
 */
export declare function useOutletContext<T = unknown>(): T;
export interface OutletProps {
    /** Value for `useOutletContext()` in the rendered child route/layout. */
    context?: unknown;
}
export declare function Outlet(props?: OutletProps): ReactElement | null;
