import type { BunPlugin } from "bun";

const CLIENT_RE = /^["']use client["']/m;
const SERVER_RE = /^["']use server["']/m;

// Strip a UTF-8 BOM and any leading ASCII whitespace before testing the
// directive regex. Editors that save files with BOM otherwise let "use server"
// fall through and ship server code to the client bundle.
function normalizeForDirectiveCheck(src: string): string {
  return src.replace(/^﻿/, "").replace(/^\s+/, "");
}
function hasClientDirective(src: string): boolean {
  return CLIENT_RE.test(normalizeForDirectiveCheck(src));
}
function hasServerDirective(src: string): boolean {
  return SERVER_RE.test(normalizeForDirectiveCheck(src));
}

function extractExports(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+(?:let|const|var)\s+(\w+)\s*=/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+default\s+(?:async\s+)?function\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s+class\s+(\w+)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/\bas\s+(\w+)$/);
      if (asMatch) names.push(asMatch[1]);
      else {
        const idMatch = trimmed.match(/^(\w+)/);
        if (idMatch) names.push(idMatch[1]);
      }
    }
  }
  return names;
}

async function actionId(filePath: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(filePath + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Server build: stub "use client" modules → null components to prevent browser API crashes. */
export const useClientStubPlugin: BunPlugin = {
  name: "bractjs:use-client-stub",
  setup(build) {
    build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async ({ path }) => {
      const src = await Bun.file(path).text();
      if (!hasClientDirective(src)) return undefined;
      const stubs = extractExports(src).map((n) => `export const ${n} = () => null;`).join("\n");
      return { contents: stubs || "export {};", loader: "ts" };
    });
  },
};

// Async fetch helper inlined into every generated "use server" proxy module.
const PROXY_HELPER = `async function __bract(id: string, args: unknown[]): Promise<unknown> {
  const isForm = args.length === 1 && args[0] instanceof FormData;
  const r = await fetch("/_action?id=" + encodeURIComponent(id), {
    method: "POST",
    headers: isForm
      ? { "X-BractJS-Action": "1" }
      : { "Content-Type": "application/json", "X-BractJS-Action": "1" },
    body: isForm ? (args[0] as FormData) : JSON.stringify(args),
  });
  if (!r.ok) throw new Error("[bractjs] action " + id + " failed: " + r.status);
  return r.json() as Promise<unknown>;
}`;

/** Client build: replace "use server" exports with fetch proxy stubs. */
export const useServerProxyPlugin: BunPlugin = {
  name: "bractjs:use-server-proxy",
  setup(build) {
    build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async ({ path }) => {
      const src = await Bun.file(path).text();
      if (!hasServerDirective(src)) return undefined;
      const names = extractExports(src);
      if (names.length === 0) return { contents: "export {};", loader: "ts" };
      const proxies = await Promise.all(
        names.map(async (name) => {
          const id = await actionId(path, name);
          return `export const ${name} = (...args: unknown[]) => __bract("${id}", args);`;
        }),
      );
      return { contents: PROXY_HELPER + "\n" + proxies.join("\n"), loader: "ts" };
    });
  },
};
