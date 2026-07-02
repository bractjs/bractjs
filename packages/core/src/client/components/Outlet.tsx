import {
  Component,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  Suspense,
  useContext,
} from "react";
import { BractJSContext } from "../../shared/context.ts";
import { RouterContext } from "../router.tsx";

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
