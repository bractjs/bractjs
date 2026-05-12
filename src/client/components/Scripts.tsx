/**
 * Scripts is a marker component.
 * Bract's SSR render pipeline injects the client entry script and
 * bootstrap data via `bootstrapScripts` and `bootstrapScriptContent`
 * in renderToReadableStream — not through this component.
 *
 * At runtime this returns null; its presence in the component tree
 * signals to the framework where scripts logically belong in the layout.
 */
export function Scripts(): null {
  return null;
}
