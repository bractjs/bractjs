import { useContext } from "react";
import { RouterContext } from "../router.tsx";
import { BractJSContext } from "../../shared/context.ts";

/**
 * Returns the current route's URL params (e.g. { id: "42" }).
 * Pass a RouteParams<T> generic for typed params: useParams<RouteParams<"/blog/:id">>()
 * Works in both SSR and client contexts.
 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  return (router?.params ?? bract?.params ?? {}) as T;
}
