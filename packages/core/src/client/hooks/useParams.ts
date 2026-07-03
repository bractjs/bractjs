import { useContext } from "react";
import { BractJSContext } from "../../shared/context.ts";
import type { ParamsFor } from "../registry.ts";
import { RouterContext } from "../router.tsx";

/**
 * Returns the current route's URL params (e.g. `{ id: "42" }`).
 *
 * Pass the route pattern as a generic to type the result against your codegen'd
 * routes: `useParams<"/blog/:id">()` → `{ id: string }`. The pattern is supplied
 * by the caller because the framework can't infer the active route at the type
 * level (React Router's `useParams` has the same limitation). An object generic
 * — `useParams<{ id: string }>()` — also works for hand-typed shapes.
 *
 * Works in both SSR and client contexts.
 */
// Overload 1: a route literal → params resolved from the registry.
export function useParams<TTo extends string>(): ParamsFor<TTo>;
// Overload 2: an explicit object shape (back-compat with the old generic form).
export function useParams<T extends Record<string, string> = Record<string, string>>(): T;
export function useParams(): Record<string, string> {
  const router = useContext(RouterContext);
  const bract = useContext(BractJSContext);
  return router?.params ?? bract?.params ?? {};
}
