import { type PathObject } from "../nav-utils.ts";
export interface NavigateProps {
    to: string | Partial<PathObject>;
    replace?: boolean;
    state?: unknown;
    /** How a relative `to` resolves: against this component's route (default) or the URL's path segments. */
    relative?: "route" | "path";
}
/**
 * React Router's `<Navigate>`: navigates as soon as it renders on the client.
 * Renders nothing and does nothing during SSR — redirect in a loader or
 * `beforeLoad` instead when the server should send a 3xx.
 */
export declare function Navigate({ to, replace, state, relative }: NavigateProps): null;
