import { Component, type ComponentType, type ReactElement, type ReactNode } from "react";

// ── DefaultErrorBoundary ───────────────────────────────────────────────────

interface DefaultErrorBoundaryProps {
  error: Error;
  requestId?: string;
}

export function DefaultErrorBoundary({ error, requestId }: DefaultErrorBoundaryProps): ReactElement {
  if (process.env.NODE_ENV !== "production") {
    return (
      <div style={{ padding: "2rem", fontFamily: "monospace" }}>
        <h2 style={{ color: "#e74c3c", margin: "0 0 1rem" }}>{error.message}</h2>
        <pre style={{ overflow: "auto", background: "#111", color: "#f8f8f8", padding: "1rem" }}>
          {error.stack}
        </pre>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(error.stack ?? error.message);
          }}
        >
          Copy stack
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Something went wrong</h2>
      {requestId && <p>Request ID: {requestId}</p>}
    </div>
  );
}

// ── RouteErrorBoundary ─────────────────────────────────────────────────────

interface RouteErrorBoundaryProps {
  errorBoundary?: ComponentType<{ error: Error }>;
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      const ErrorComponent = this.props.errorBoundary ?? DefaultErrorBoundary;
      return <ErrorComponent error={this.state.error} />;
    }
    return this.props.children;
  }
}
