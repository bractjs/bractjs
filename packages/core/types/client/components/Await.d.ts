import { type ReactNode } from "react";
import { Deferred } from "../../shared/deferred.ts";
interface AwaitProps<T> {
    /**
     * A promise, or a `Deferred<T>` field from a loader that returned `defer()`.
     * `useLoaderData<typeof loader>()` preserves deferred fields as `Deferred<T>`,
     * so they can be passed straight through.
     */
    resolve: Promise<T> | Deferred<T>;
    /** Shown while pending. Optional (React Router lets an outer `<Suspense>` provide it). */
    fallback?: ReactNode;
    /**
     * Shown when the promise rejects (React Router). Read the error with
     * `useAsyncError()`. Without it, the rejection propagates to the route's
     * ErrorBoundary.
     */
    errorElement?: ReactNode;
    /** A render function of the value, or elements that read it via `useAsyncValue()`. */
    children: ((data: T) => ReactNode) | ReactNode;
}
/** React Router's `useAsyncValue()`: the resolved value of the nearest `<Await>`. */
export declare function useAsyncValue<T = unknown>(): T;
/** React Router's `useAsyncError()`: the rejection of the nearest `<Await>` (inside its `errorElement`). */
export declare function useAsyncError(): unknown;
export declare function Await<T>({ resolve, fallback, errorElement, children }: AwaitProps<T>): import("react").JSX.Element;
export {};
