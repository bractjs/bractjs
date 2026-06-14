import { Suspense, use, type ReactNode } from "react";
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

/**
 * Unwraps a promise using React 19's `use()` API.
 * The nearest <Suspense> boundary (provided by <Await> itself) handles the
 * pending state by rendering `fallback`. On resolve, `children` is called
 * with the resolved value.
 */
function Resolved<T>({ resolve, children }: Pick<AwaitProps<T>, "resolve" | "children">) {
  const promise = resolve instanceof Deferred ? resolve.promise : resolve;
  const data = use(promise);
  return <>{children(data)}</>;
}

export function Await<T>({ resolve, fallback, children }: AwaitProps<T>) {
  return (
    <Suspense fallback={fallback}>
      <Resolved resolve={resolve}>{children}</Resolved>
    </Suspense>
  );
}
