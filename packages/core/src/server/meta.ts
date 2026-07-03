import type { MetaDescriptor } from "../shared/route-types.ts";
import type { LayoutChain } from "./layout.ts";
import type { LoaderResults } from "./loader.ts";

type Params = Record<string, string>;

// ── resolveMeta ────────────────────────────────────────────────────────────

/**
 * Calls each route module's meta() in layout chain order (root → layouts → route),
 * passing the appropriate loaderData slice + params to each.
 */
export function resolveMeta(chain: LayoutChain, loaderData: LoaderResults, params: Params): MetaDescriptor[] {
  const all: MetaDescriptor[] = [];

  if (chain.root.meta) {
    all.push(...chain.root.meta({ loaderData: loaderData.root, params }));
  }

  chain.layouts.forEach((mod, i) => {
    if (mod.meta) {
      all.push(...mod.meta({ loaderData: loaderData.layouts[i] ?? null, params }));
    }
  });

  if (chain.route.meta) {
    all.push(...chain.route.meta({ loaderData: loaderData.route, params }));
  }

  return all;
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
