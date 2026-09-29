import type { LinkDescriptor, MetaDescriptor, MetaMatch } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";

type Params = Record<string, string>;

// ── resolveMeta ────────────────────────────────────────────────────────────

/** Request-level inputs for `meta()` beyond the loader data. */
export interface MetaContext {
  pathname: string;
  /** Raw query string including `?`, or `""`. */
  search?: string;
  /** The route loader's error, when it failed (passed to root/layout meta). */
  error?: unknown;
}

/**
 * Calls each route module's meta() in layout chain order (root → layouts → route),
 * passing the appropriate loaderData slice + params to each — plus the React
 * Router 7 arguments (`data`, `location`, `matches` with each ancestor's
 * resolved `meta`), so ported `meta` functions work unchanged.
 */
export function resolveMeta(
  chain: LayoutChain,
  loaderData: LoaderResults,
  params: Params,
  ctx: MetaContext = { pathname: "/" },
): MetaDescriptor[] {
  const all: MetaDescriptor[] = [];
  const location = { pathname: ctx.pathname, search: ctx.search ?? "", hash: "" };
  const files = chain.files;
  const entries: Array<{ mod: LayoutChain["root"]; data: unknown; id: string }> = [
    { mod: chain.root, data: loaderData.root, id: files?.root ?? "root" },
    ...chain.layouts.map((mod, i) => ({
      mod,
      data: loaderData.layouts[i] ?? null,
      id: files?.layouts?.[i] ?? `layout:${i}`,
    })),
    { mod: chain.route, data: loaderData.route, id: files?.route ?? "route" },
  ];
  const matches: MetaMatch[] = [];

  entries.forEach(({ mod, data, id }, i) => {
    const match: MetaMatch = {
      id,
      pathname: ctx.pathname,
      params,
      data,
      loaderData: data,
      handle: mod.handle,
      meta: [],
    };
    matches.push(match);
    if (!mod.meta) return;
    const isRoute = i === entries.length - 1;
    const produced = mod.meta({
      loaderData: data,
      data,
      params,
      location,
      matches: matches.slice(),
      error: isRoute ? undefined : ctx.error,
    });
    match.meta = produced ?? [];
    all.push(...match.meta);
  });

  return all;
}

// ── resolveLinks ───────────────────────────────────────────────────────────

/**
 * Collect every module's `links()` export (root → layouts → route), deduped by
 * `rel` + `href` (first wins). A throwing `links()` is logged and skipped — a
 * broken preload hint must not take the page down.
 */
export function resolveLinks(chain: LayoutChain): LinkDescriptor[] {
  const out: LinkDescriptor[] = [];
  const seen = new Set<string>();
  for (const mod of [chain.root, ...chain.layouts, chain.route]) {
    if (typeof mod.links !== "function") continue;
    let produced: LinkDescriptor[];
    try {
      produced = mod.links() ?? [];
    } catch (err) {
      console.error("[bractjs] links() threw:", err);
      continue;
    }
    for (const l of produced) {
      if (!l || typeof l !== "object" || typeof l.rel !== "string") continue;
      const key = `${l.rel}|${l.href ?? JSON.stringify(l)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}

// ── mergeMeta ──────────────────────────────────────────────────────────────

/**
 * Deduplicates descriptors: for same `name` or `property`, last-writer wins.
 * Title: last `{ title }` descriptor wins.
 */
export function mergeMeta(descriptors: MetaDescriptor[]): MetaDescriptor[] {
  const byName = new Map<string, MetaDescriptor>();
  const byProperty = new Map<string, MetaDescriptor>();
  let title: MetaDescriptor | null = null;
  const rest: MetaDescriptor[] = [];

  for (const d of descriptors) {
    if ("title" in d) {
      title = d;
    } else if ("name" in d) {
      byName.set((d as { name: string }).name, d);
    } else if ("property" in d) {
      byProperty.set((d as { property: string }).property, d);
    } else {
      rest.push(d);
    }
  }

  return [
    ...(title ? [title] : []),
    ...Array.from(byName.values()),
    ...Array.from(byProperty.values()),
    ...rest,
  ];
}

// ── renderMetaTags ─────────────────────────────────────────────────────────

/** Returns HTML string of <title> and <meta> tags for SSR head injection. */
export function renderMetaTags(descriptors: MetaDescriptor[]): string {
  return descriptors
    .map((d) => {
      if ("title" in d) return `<title>${escHtml(String((d as { title: string }).title))}</title>`;
      if ("name" in d) {
        const { name, content } = d as { name: string; content: string };
        return `<meta name="${escHtml(name)}" content="${escHtml(content)}">`;
      }
      if ("property" in d) {
        const { property, content } = d as { property: string; content: string };
        return `<meta property="${escHtml(property)}" content="${escHtml(content)}">`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
