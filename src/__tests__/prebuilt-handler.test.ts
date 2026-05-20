import { test, expect, describe } from "bun:test";
import { buildFetchHandler } from "../server/serve.ts";
import type { RouteModule } from "../shared/route-types.ts";

// Validates the `bun build --compile` code path: every input that the
// framework would normally derive from the filesystem (`Bun.Glob` of routes/,
// `import(absPath)` of route modules, `loadManifest` from disk) is provided
// upfront. The appDir/publicDir/buildDir paths point at a nonexistent
// directory to prove no filesystem fall-through happens.

const NON_EXISTENT_DIR = "/this/path/does/not/exist/bractjs-prebuilt";

const indexRouteModule: RouteModule = {
  loader: async () => ({ ok: true, source: "prebuilt-loader" }),
  meta: () => [{ title: "Prebuilt Title" }],
  default: () => null,
};

const rootModule: RouteModule = {
  default: () => null,
};

const sendActionMod = {
  send: async (payload: unknown) => ({ echoed: payload }),
};

// Hash matches the ID a client proxy would compute for relPath "actions.server.ts" + "send".
async function clientId(relPath: string, name: string): Promise<string> {
  const raw = new TextEncoder().encode(relPath + "#" + name);
  const buf = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const fetchHandler = buildFetchHandler({
  appDir: NON_EXISTENT_DIR,
  publicDir: NON_EXISTENT_DIR,
  buildDir: NON_EXISTENT_DIR,
  manifest: { clientEntry: "/build/client/client.js", routes: {} },
  routeFiles: [
    { filePath: "routes/_index.tsx", urlPattern: "", segments: [] },
  ],
  moduleRegistry: {
    "root.tsx": rootModule,
    "routes/_index.tsx": indexRouteModule,
  },
  actionModules: [
    { relPath: "actions.server.ts", mod: sendActionMod },
  ],
});

describe("buildFetchHandler — pre-built (compiled-binary) path", () => {
  test("GET / renders HTML with loader data from registry", async () => {
    const res = await fetchHandler(new Request("http://x/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("prebuilt-loader");
    expect(html).toContain("Prebuilt Title");
  });

  test("GET /_data?path=/ returns JSON loader output", async () => {
    const res = await fetchHandler(new Request("http://x/_data?path=/"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).toHaveProperty("route");
    expect((data.route as Record<string, unknown>).ok).toBe(true);
  });

  test("GET /missing returns 404 from the prebuilt trie", async () => {
    const res = await fetchHandler(new Request("http://x/missing"));
    expect(res.status).toBe(404);
  });

  test("POST /_action with registry-derived ID succeeds", async () => {
    const id = await clientId("actions.server.ts", "send");
    const res = await fetchHandler(
      new Request(`http://x/_action?id=${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BractJS-Action": "1",
          Origin: "http://x",
        },
        body: JSON.stringify([{ hello: "world" }]),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { echoed: Record<string, unknown> };
    expect(json.echoed).toEqual({ hello: "world" });
  });
});
