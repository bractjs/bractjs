import { useContext, useEffect, useRef } from "react";
import { useResolveTo } from "../hooks/useResolveTo.ts";
import { type PathObject, resolveHref } from "../nav-utils.ts";
import { NavigationContext } from "../router.tsx";

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
export function Navigate({ to, replace, state, relative }: NavigateProps): null {
  const navCtx = useContext(NavigationContext);
  const done = useRef(false);
  const href = useResolveTo()(to, relative);
  useEffect(() => {
    if (!navCtx || done.current) return;
    done.current = true;
    void navCtx.navigate(resolveHref(href), { replace, state });
  }, [navCtx, href, replace, state]);
  return null;
}
