export type OnErrorHook = (err: unknown, request?: Request) => Promise<void> | void;
export interface LifecycleHooks {
    onStart?: () => Promise<void> | void;
    onShutdown?: () => Promise<void> | void;
    /** Called for every unexpected error: loader failures, action throws, and uncaught process exceptions. Redirects and HttpErrors are intentional control flow and are NOT reported here. Use this to send errors to Sentry, Datadog, etc. The request is undefined for process-level exceptions. */
    onError?: OnErrorHook;
}
/** Type-safe helper for declaring server lifecycle hooks in app/lifecycle.ts. */
export declare function defineLifecycle(hooks: LifecycleHooks): LifecycleHooks;
/** Safely invokes the onError hook. Errors thrown inside the hook are caught and logged so they never mask the original error or alter the response. */
export declare function fireOnError(hook: OnErrorHook | undefined, err: unknown, request?: Request): Promise<void>;
