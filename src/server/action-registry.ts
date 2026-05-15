import { join } from "node:path";

// Anchored at start-of-file. Allow whitespace and line/block comments before
// the "use server" string literal. This prevents false matches from a "use
// server" found inside template literals or runtime strings.
const SERVER_RE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;
const registry = new Map<string, (...args: unknown[]) => Promise<unknown>>();

async function computeId(filePath: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(filePath + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function resolveAction(id: string): ((...args: unknown[]) => Promise<unknown>) | null {
  return registry.get(id) ?? null;
}

function isEligible(rel: string): boolean {
  return (
    rel.endsWith(".server.ts") ||
    rel.endsWith(".server.tsx") ||
    rel.startsWith("routes/") ||
    rel.startsWith("routes\\")
  );
}

export async function loadServerActions(appDir: string): Promise<void> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for await (const rel of glob.scan(appDir)) {
    if (!isEligible(rel)) continue;
    const filePath = join(appDir, rel);
    let src: string;
    try { src = await Bun.file(filePath).text(); } catch { continue; }
    if (!SERVER_RE.test(src)) continue;

    let mod: Record<string, unknown>;
    try {
      mod = await import(filePath) as Record<string, unknown>;
    } catch (err) {
      console.error("[bractjs] failed to load server actions from", rel, err);
      continue;
    }

    for (const [name, val] of Object.entries(mod)) {
      if (typeof val !== "function") continue;
      const id = await computeId(filePath, name);
      registry.set(id, val as (...args: unknown[]) => Promise<unknown>);
    }
  }
}
