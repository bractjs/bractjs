import { Component, type ComponentType, type ReactElement, type ReactNode } from "react";
interface DefaultErrorBoundaryProps {
    error: Error;
    requestId?: string;
}
export declare function DefaultErrorBoundary({ error, requestId }: DefaultErrorBoundaryProps): ReactElement;
interface RouteErrorBoundaryProps {
    errorBoundary?: ComponentType<{
        error: Error;
    }>;
    children: ReactNode;
}
interface RouteErrorBoundaryState {
    error: Error | null;
}
export declare class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
    state: RouteErrorBoundaryState;
    static getDerivedStateFromError(error: Error): RouteErrorBoundaryState;
    render(): ReactNode;
}
export {};
