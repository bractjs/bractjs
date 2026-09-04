import { type ReactNode } from "react";
import { Deferred } from "../../shared/deferred.ts";
interface AwaitProps<T> {
    /**
     * A promise, or a `Deferred<T>` field from a loader that returned `defer()`.
     * `useLoaderData<typeof loader>()` preserves deferred fields as `Deferred<T>`,
     * so they can be passed straight through.
     */
    resolve: Promise<T> | Deferred<T>;
    fallback: ReactNode;
    children: (data: T) => ReactNode;
}
export declare function Await<T>({ resolve, fallback, children }: AwaitProps<T>): import("react").JSX.Element;
export {};
