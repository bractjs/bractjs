export interface LifecycleHooks {
  onStart?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
}

/** Type-safe helper for declaring server lifecycle hooks in app/lifecycle.ts. */
export function defineLifecycle(hooks: LifecycleHooks): LifecycleHooks {
  return hooks;
}
