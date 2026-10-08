// Incremental static regeneration for prerendered pages.
//
// A prerendered route with `export const config = { revalidate: 60 }` is
// recorded in `_prerender/_isr.json` at build time (build/prerender.ts asks
// via PRERENDER_HEADER; the handler answers with REVALIDATE_HEADER). The
// production server then serves that page — document and `/_data` payload —
// from memory, and once it is older than `revalidate` seconds keeps serving it
// while one background regeneration renders a fresh copy through the full
// request handler. A failed regeneration keeps the old copy. The cache is per
// process: each instance of a scaled-out app regenerates on its own.

import { applyCspNonce, readNonceStamp } from "./csp.ts";
import { DOCUMENT_SECURITY_HEADERS } from "./render.ts";

// Requests the server makes to render a page for a CACHE (prerendering at
// build time, ISR regeneration), each with the per-render CSP nonce
// placeholder (createNoncePlaceholder) the cached copy is served through.
// Tracked by object identity, not a header: a header any client could send
// would let a visitor obtain — and a shared cache store — a placeholder page.
const cachedRenders = new WeakMap<Request, string>();

/** Mark `request` as a render-for-cache request (the server's own), rendered with `placeholder`. Returns it. */
export function markCachedRender(request: Request, placeholder: string): Request {
  cachedRenders.set(request, placeholder);
  return request;
}

/** The nonce placeholder `request` renders with, when the server made it to render a page for a cache. */
export function cachedRenderPlaceholder(request: Request): string | undefined {
  return cachedRenders.get(request);
}

/** Sent by prerendering: "tell me if this page is an ISR page". */
export const PRERENDER_HEADER = "X-BractJS-Prerender";
/** The handler's answer: the route's `config.revalidate`, in seconds. */
export const REVALIDATE_HEADER = "X-BractJS-Revalidate";
/** Marks the server's own regeneration requests (with a per-process secret), which must skip the cache. */
export const ISR_REGEN_HEADER = "X-BractJS-ISR-Regenerate";
/** Under `<buildDir>/client/_prerender/`. */
export const ISR_MANIFEST = "_isr.json";

export interface IsrManifest {
  /** When the build rendered the pages (ms since epoch). */
  generatedAt: number;
  /** Prerendered path → revalidate seconds. */
  routes: Record<string, number>;
}

/** Validate a route's `config.revalidate` (seconds). */
export function parseRevalidate(value: unknown, path: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `[bractjs] ${path}: config.revalidate must be a positive number of seconds, got ${String(value)}`,
    );
  }
  return n;
}

interface Entry {
  revalidate: number;
  generatedAt: number;
  html: string | null;
  data: string | null;
  /** The CSP nonce placeholder `html` was rendered with (see createNoncePlaceholder). */
  placeholder?: string;
  /** …and `data` (it can lag: a regeneration whose `/_data` failed keeps the previous copy). */
  dataPlaceholder?: string;
  loaded: boolean;
  inflight?: Promise<boolean>;
}

export interface IsrOptions {
  /** Read a build-time file under `_prerender/` (embedded or on disk); null when absent. */
  load(rel: string): Promise<string | null>;
  /**
   * Render `path` fresh, bypassing the prerender cache: the document and its
   * `/_data` payload, and the CSP nonce placeholder both were rendered with.
   */
  render(path: string): Promise<{ html: Response; data: Response; placeholder?: string }>;
  now?: () => number;
}

export interface Isr {
  /**
   * The ISR response for a document (`kind: "html"`) or `/_data` request, or
   * null when `path` isn't an ISR page. `nonce`: the request's CSP nonce, put
   * in place of the placeholder the cached copy was rendered with.
   */
  serve(path: string, kind: "html" | "data", nonce?: string): Promise<Response | null>;
  /** Regenerate `path` now. Resolves false when it isn't an ISR page or rendering failed. */
  revalidate(path: string): Promise<boolean>;
}

/** `/about/` → `/about`; `/` stays. */
export function normalizeIsrPath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") || "/" : path;
}

function filesFor(path: string): { html: string; data: string } {
  const dir = path === "/" ? "" : path.slice(1);
  return dir === ""
    ? { html: "index.html", data: "_data.json" }
    : { html: `${dir}/index.html`, data: `${dir}/_data.json` };
}

export function createIsr(options: IsrOptions): Isr {
  const now = options.now ?? Date.now;
  let entries: Promise<Map<string, Entry>> | null = null;

  function table(): Promise<Map<string, Entry>> {
    entries ??= (async () => {
      const map = new Map<string, Entry>();
      const raw = await options.load(ISR_MANIFEST).catch(() => null);
      if (!raw) return map;
      try {
        const manifest = JSON.parse(raw) as IsrManifest;
        for (const [path, seconds] of Object.entries(manifest.routes ?? {})) {
          map.set(normalizeIsrPath(path), {
            revalidate: parseRevalidate(seconds, path),
            generatedAt: manifest.generatedAt ?? 0,
            html: null,
            data: null,
            loaded: false,
          });
        }
      } catch (err) {
        console.error("[bractjs] ignoring an unreadable _prerender/_isr.json:", err);
      }
      return map;
    })();
    return entries;
  }

  function regenerate(path: string, entry: Entry): Promise<boolean> {
    entry.inflight ??= (async () => {
      try {
        const { html, data, placeholder } = await options.render(path);
        if (html.status !== 200) {
          console.error(
            `[bractjs] ISR: regenerating ${path} answered ${html.status}; serving the previous copy`,
          );
          await Promise.all([html.body?.cancel(), data.body?.cancel()]).catch(() => {});
          // Back off for a full interval: retrying on every request would
          // re-render the page continuously while it keeps failing.
          entry.generatedAt = now();
          return false;
        }
        const freshData = data.status === 200;
        const [htmlText, dataText] = await Promise.all([
          html.text(),
          freshData ? data.text() : (data.body?.cancel() ?? Promise.resolve()).then(() => entry.data),
        ]);
        entry.html = htmlText;
        entry.data = dataText;
        entry.placeholder = placeholder;
        if (freshData) entry.dataPlaceholder = placeholder;
        entry.generatedAt = now();
        entry.loaded = true;
        return true;
      } catch (err) {
        console.error(`[bractjs] ISR: regenerating ${path} failed; serving the previous copy:`, err);
        entry.generatedAt = now(); // back off, as above
        return false;
      } finally {
        entry.inflight = undefined;
      }
    })();
    return entry.inflight;
  }

  return {
    async serve(rawPath, kind, nonce) {
      const path = normalizeIsrPath(rawPath);
      const entry = (await table()).get(path);
      if (!entry) return null;
      if (!entry.loaded) {
        const files = filesFor(path);
        const [html, data] = await Promise.all([options.load(files.html), options.load(files.data)]);
        // A concurrent regeneration may have filled it meanwhile.
        if (!entry.loaded) {
          // The build-time copy carries its placeholder in a leading stamp.
          const stamped = html === null ? null : readNonceStamp(html);
          entry.html = stamped?.body ?? null;
          entry.placeholder = stamped?.placeholder;
          // Prerendering renders a page's document and /_data with one placeholder.
          entry.dataPlaceholder = stamped?.placeholder;
          entry.data = data;
          entry.loaded = true;
        }
      }
      if (now() - entry.generatedAt >= entry.revalidate * 1000) void regenerate(path, entry);
      const body = kind === "html" ? entry.html : entry.data;
      if (body === null) return null;
      const placeholder = kind === "html" ? entry.placeholder : entry.dataPlaceholder;
      return new Response(applyCspNonce(body, placeholder, nonce), {
        headers: {
          ...DOCUMENT_SECURITY_HEADERS,
          "Content-Type": kind === "html" ? "text/html; charset=utf-8" : "application/json",
          // Browsers revalidate; shared caches may hold it as long as the server does.
          "Cache-Control": `public, max-age=0, s-maxage=${entry.revalidate}, stale-while-revalidate=${entry.revalidate}`,
        },
      });
    },
    async revalidate(rawPath) {
      const path = normalizeIsrPath(rawPath);
      const entry = (await table()).get(path);
      if (!entry) return false;
      return regenerate(path, entry);
    },
  };
}

const live = new Set<Isr>();

/** @internal A server's ISR cache, for `revalidatePath()`. Returns the unregister function. */
export function registerIsr(isr: Isr): () => void {
  live.add(isr);
  return () => live.delete(isr);
}

/**
 * Regenerate a prerendered ISR page now (route `config.revalidate`) — e.g.
 * from an action after the content behind it changed. Resolves true when a
 * fresh copy was rendered. Works on this server process only.
 */
export async function revalidatePath(path: string): Promise<boolean> {
  const results = await Promise.all([...live].map((isr) => isr.revalidate(path)));
  return results.some(Boolean);
}
