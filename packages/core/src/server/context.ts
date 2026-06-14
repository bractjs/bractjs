// ── ContextFactory ─────────────────────────────────────────────────────────

export interface ContextFactory<T> {
  _factory: (args: { request: Request; params: Record<string, string> }) => T | Promise<T>;
}

/**
 * Define a per-route context factory.
 *
 * Route files export `export const context = defineContext(async ({ request, params }) => { ... })`
 * The result is merged into the `context` arg received by all loaders and actions on that route.
 *
 * Example:
 *   export const context = defineContext(async ({ request }) => ({
 *     user: await getUser(request),
 *   }));
 */
export function defineContext<T>(
  factory: (args: { request: Request; params: Record<string, string> }) => T | Promise<T>,
): ContextFactory<T> {
  return { _factory: factory };
}
