import {
  Component,
  type ComponentType,
  createContext,
  type ReactElement,
  type ReactNode,
  Suspense,
  useContext,
} from "react";
import {
  BractJSContext,
  type BractJSContextValue,
  LoaderSliceContext,
  OutletLevelContext,
} from "../../shared/context.ts";
import { pickErrorBoundary, renderErrorBoundary, routeLoaderError } from "../../shared/route-error.ts";
import { RouterContext, type RouterContextValue } from "../router.tsx";

// ── Error Boundary ─────────────────────────────────────────────────────────

interface EBProps {
  fallback: ComponentType<{ error: Error }>;
  children: ReactNode;
}
interface EBState {
  error: Error | null;
}

class RouteErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      return renderErrorBoundary(this.props.fallback as ComponentType<{ error: unknown }>, this.state.error);
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error }: { error: Error }): ReactElement {
  return <div style={{ color: "red" }}>Route error: {error.message}</div>;
}

// ── Outlet context (React Router `<Outlet context>` / `useOutletContext`) ──

const OutletContext = createContext<unknown>(undefined);

/**
 * React Router's `useOutletContext()`: the `context` prop of the nearest
 * parent `<Outlet context={…}>` — how a layout shares state with the routes it
 * renders without prop drilling or a hand-made React context.
 */
export function useOutletContext<T = unknown>(): T {
  return useContext(OutletContext) as T;
}

/** Props route and layout components receive (React Router `Route.ComponentProps`). */
function componentProps(
  routerCtx: RouterContextValue | null,
  bractCtx: BractJSContextValue | null,
  slice: number | "route",
): Record<string, unknown> {
  const loaderData = (routerCtx?.loaderData ?? bractCtx?.loaderData ?? {}) as Record<string, unknown>;
  return {
    loaderData: slice === "route" ? loaderData.route : (loaderData.layouts as unknown[] | undefined)?.[slice],
    actionData: (routerCtx ? routerCtx.actionData : bractCtx?.actionData) ?? undefined,
    params: routerCtx?.params ?? bractCtx?.params ?? {},
    matches: routerCtx?.matches ?? bractCtx?.matches ?? [],
  };
}

// ── Outlet ─────────────────────────────────────────────────────────────────

export interface OutletProps {
  /** Value for `useOutletContext()` in the rendered child route/layout. */
  context?: unknown;
}

export function Outlet(props: OutletProps = {}): ReactElement | null {
  const inner = <OutletInner />;
  // Only override the outlet context when this <Outlet> sets one, so nested
  // outlets without a `context` prop pass the parent's value through.
  return "context" in props ? (
    <OutletContext.Provider value={props.context}>{inner}</OutletContext.Provider>
  ) : (
    inner
  );
}

function OutletInner(): ReactElement | null {
  // Client-side: use RouterContext (set by ClientRouter after navigation)
  const routerCtx = useContext(RouterContext);
  // Server-side (SSR): fall back to BractJSContext which carries RouteComponent
  const bractCtx = useContext(BractJSContext);
  const level = useContext(OutletLevelContext);

  // Levels 0…n-1 are the route's layout.tsx components (outermost first); each
  // renders the next level through its own <Outlet>. Layouts without a
  // component (a guard-only layout.ts) are skipped. The "spa" shell knows no
  // route, so nothing renders below root until the client has loaded one.
  const pending = routerCtx?.hydrationPending;
  const layoutModules = routerCtx ? routerCtx.currentLayouts : (bractCtx?.LayoutModules ?? []);
  const layouts = pending === "spa" ? [] : renderableLayouts(layoutModules);
  if (level < layouts.length) {
    const { Component, dataIndex } = layouts[level];
    return (
      <OutletLevelContext.Provider value={level + 1}>
        <LoaderSliceContext.Provider value={dataIndex}>
          <Component {...componentProps(routerCtx, bractCtx, dataIndex)} />
        </LoaderSliceContext.Provider>
      </OutletLevelContext.Provider>
    );
  }
  // The route level: reset the loader slice so the route (and anything it
  // renders) reads the route's data, not the enclosing layout's.
  return (
    <LoaderSliceContext.Provider value={null}>
      <RouteOutlet routerCtx={routerCtx} bractCtx={bractCtx} />
    </LoaderSliceContext.Provider>
  );
}

/** Layouts that render something, each with its index into `loaderData.layouts`. */
function renderableLayouts(
  modules: ReadonlyArray<{ default?: ComponentType } | null | undefined>,
): Array<{ Component: ComponentType<Record<string, unknown>>; dataIndex: number }> {
  const out: Array<{ Component: ComponentType<Record<string, unknown>>; dataIndex: number }> = [];
  modules.forEach((mod, dataIndex) => {
    if (mod?.default) out.push({ Component: mod.default, dataIndex });
  });
  return out;
}

function RouteOutlet({
  routerCtx,
  bractCtx,
}: {
  routerCtx: RouterContextValue | null;
  bractCtx: BractJSContextValue | null;
}): ReactElement | null {
  // While selective-SSR hydration is pending, render exactly what the server
  // sent: the route's Fallback ("client-only"/"data-only" documents) or
  // nothing (the "spa" shell knows no route at build time). Rendering the real
  // component here would mismatch the server HTML.
  const pending = routerCtx?.hydrationPending;
  const RouteComponent = (
    pending
      ? pending === "spa"
        ? undefined
        : (routerCtx?.currentModule?.Fallback ?? routerCtx?.currentModule?.HydrateFallback)
      : (routerCtx?.currentModule?.default ?? bractCtx?.RouteComponent)
  ) as ComponentType<Record<string, unknown>> | undefined;
  const ErrorFallback: ComponentType<{ error: Error }> =
    routerCtx?.currentModule?.ErrorBoundary ?? DefaultErrorFallback;

  // A failed route loader leaves `{ __error }` in the route slot: render the
  // nearest ErrorBoundary in the route's place — the same component the server
  // rendered (request-handler.ts), so hydration matches. (On the server,
  // RouteComponent is already that boundary.)
  const loaderError = routerCtx && !pending ? routeLoaderError(routerCtx.loaderData?.route) : null;
  if (loaderError) {
    // Selects an existing component (route's, root's, or the built-in one).
    const boundary = renderErrorBoundary(
      pickErrorBoundary(
        routerCtx?.currentModule?.ErrorBoundary as ComponentType<{ error: unknown }> | undefined,
        routerCtx?.rootErrorBoundary,
      ),
      loaderError,
      { params: routerCtx?.params },
    );
    return (
      <RouteErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={null}>{boundary}</Suspense>
      </RouteErrorBoundary>
    );
  }

  if (!RouteComponent) {
    return <Suspense fallback={null}>{null}</Suspense>;
  }

  return (
    <RouteErrorBoundary fallback={ErrorFallback}>
      <Suspense fallback={null}>
        <RouteComponent {...(pending ? {} : componentProps(routerCtx, bractCtx, "route"))} />
      </Suspense>
    </RouteErrorBoundary>
  );
}
