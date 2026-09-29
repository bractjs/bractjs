import { useContext, useEffect, useRef } from "react";
import { type PathObject, pathToString, resolveHref } from "../nav-utils.ts";
import { NavigationContext } from "../router.tsx";

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
export function Navigate({ to, replace, state }: NavigateProps): null {
  const navCtx = useContext(NavigationContext);
  const done = useRef(false);
  const href = pathToString(to);
  useEffect(() => {
    if (!navCtx || done.current) return;
    done.current = true;
    void navCtx.navigate(resolveHref(href), { replace, state });
  }, [navCtx, href, replace, state]);
  return null;
}
