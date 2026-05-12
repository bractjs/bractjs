import {
  Component, Suspense, useContext,
  type ComponentType, type ReactElement, type ReactNode,
} from "react";
import { RouterContext } from "../router.tsx";
import { BractJSContext } from "../../shared/context.ts";

// ── Error Boundary ─────────────────────────────────────────────────────────

interface EBProps {
  fallback: ComponentType<{ error: Error }>;
  children: ReactNode;
}
interface EBState { error: Error | null }

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

  const RouteComponent: ComponentType | undefined =
    routerCtx?.currentModule?.default ?? bractCtx?.RouteComponent;
  const ErrorFallback: ComponentType<{ error: Error }> =
    routerCtx?.currentModule?.ErrorBoundary ?? DefaultErrorFallback;

  if (!RouteComponent) {
    return (
      <Suspense fallback={null}>
        {null}
      </Suspense>
    );
  }

  return (
    <RouteErrorBoundary fallback={ErrorFallback}>
      <Suspense fallback={null}>
        <RouteComponent />
      </Suspense>
    </RouteErrorBoundary>
  );
}
