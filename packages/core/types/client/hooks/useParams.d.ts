import type { ParamsFor } from "../registry.ts";
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
export declare function useParams<TTo extends string>(): ParamsFor<TTo>;
export declare function useParams<T extends Record<string, string> = Record<string, string>>(): T;
