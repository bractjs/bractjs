import { type PathObject } from "../nav-utils.ts";
export interface NavigateProps {
    to: string | Partial<PathObject>;
    replace?: boolean;
    state?: unknown;
}
/**
 * React Router's `<Navigate>`: navigates as soon as it renders on the client.
 * Renders nothing and does nothing during SSR — redirect in a loader or
 * `beforeLoad` instead when the server should send a 3xx.
 */
export declare function Navigate({ to, replace, state }: NavigateProps): null;
