import { Suspense, use, type ReactNode } from "react";

interface AwaitProps<T> {
  resolve: Promise<T>;
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
  const data = use(resolve);
  return <>{children(data)}</>;
}

export function Await<T>({ resolve, fallback, children }: AwaitProps<T>) {
  return (
    <Suspense fallback={fallback}>
      <Resolved resolve={resolve}>{children}</Resolved>
    </Suspense>
  );
}
