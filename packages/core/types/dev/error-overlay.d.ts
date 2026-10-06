/**
 * Browser-injected dev error overlay (dev runtime only; see server/render.ts).
 *
 * Shows an error when something assigns `window.__BRACTJS_ERROR__ = { message,
 * stack }` — the client entry does for a loader error captured during SSR — or
 * when the page throws (`error` / `unhandledrejection`). The stack goes to
 * `POST /_bractjs/stack` (dev/overlay-endpoints.ts), which maps browser frames
 * through the dev build's source maps and returns code excerpts; each frame
 * can be opened in the editor via `POST /_bractjs/open`. Escape or × closes it.
 *
 * Plain ES5 in a string: it runs before any bundle loads.
 */
export declare const errorOverlayScript: string;
