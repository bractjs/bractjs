import {
  Component,
  type ComponentType,
  createElement,
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
import { pickErrorBoundary, routeLoaderError } from "../../shared/route-error.ts";
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
      const Fallback = this.props.fallback;
      return <Fallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error }: { error: Error }): ReactElement {
  return <div style={{ color: "red" }}>Route error: {error.message}</div>;
}

// ── Outlet ─────────────────────────────────────────────────────────────────

export function Outlet(): ReactElement | null {
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
          <Component />
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
): Array<{ Component: ComponentType; dataIndex: number }> {
  const out: Array<{ Component: ComponentType; dataIndex: number }> = [];
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
  const RouteComponent: ComponentType | undefined = pending
    ? pending === "spa"
      ? undefined
      : routerCtx?.currentModule?.Fallback
    : (routerCtx?.currentModule?.default ?? bractCtx?.RouteComponent);
  const ErrorFallback: ComponentType<{ error: Error }> =
    routerCtx?.currentModule?.ErrorBoundary ?? DefaultErrorFallback;

  // A failed route loader leaves `{ __error }` in the route slot: render the
  // nearest ErrorBoundary in the route's place — the same component the server
  // rendered (request-handler.ts), so hydration matches. (On the server,
  // RouteComponent is already that boundary.)
  const loaderError = routerCtx && !pending ? routeLoaderError(routerCtx.loaderData?.route) : null;
  if (loaderError) {
    // Selects an existing component (route's, root's, or the built-in one).
    const boundary = createElement(
      pickErrorBoundary(
        routerCtx?.currentModule?.ErrorBoundary as ComponentType<{ error: unknown }> | undefined,
        routerCtx?.rootErrorBoundary,
      ),
      { error: loaderError },
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
        <RouteComponent />
      </Suspense>
    </RouteErrorBoundary>
  );
}
