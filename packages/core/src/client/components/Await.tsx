import { Component, createContext, type ReactNode, Suspense, use, useContext } from "react";
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

const AsyncValueContext = createContext<unknown>(undefined);
const AsyncErrorContext = createContext<unknown>(undefined);

/** React Router's `useAsyncValue()`: the resolved value of the nearest `<Await>`. */
export function useAsyncValue<T = unknown>(): T {
  return useContext(AsyncValueContext) as T;
}

/** React Router's `useAsyncError()`: the rejection of the nearest `<Await>` (inside its `errorElement`). */
export function useAsyncError(): unknown {
  return useContext(AsyncErrorContext);
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
  return (
    <AsyncValueContext.Provider value={data}>
      {typeof children === "function" ? (children as (d: T) => ReactNode)(data) : children}
    </AsyncValueContext.Provider>
  );
}

class AwaitErrorBoundary extends Component<
  { errorElement: ReactNode; children: ReactNode },
  { error: unknown; failed: boolean }
> {
  state = { error: undefined as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }
  render(): ReactNode {
    if (this.state.failed) {
      return (
        <AsyncErrorContext.Provider value={this.state.error}>
          {this.props.errorElement}
        </AsyncErrorContext.Provider>
      );
    }
    return this.props.children;
  }
}

export function Await<T>({ resolve, fallback = null, errorElement, children }: AwaitProps<T>) {
  const body = (
    <Suspense fallback={fallback}>
      <Resolved resolve={resolve}>{children}</Resolved>
    </Suspense>
  );
  return errorElement === undefined ? (
    body
  ) : (
    <AwaitErrorBoundary errorElement={errorElement}>{body}</AwaitErrorBoundary>
  );
}
