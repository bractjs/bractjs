import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeShakePlugin, SERVER_ONLY_ROUTE_EXPORTS } from "../build/plugins/route-shake.ts";

// The client-bundle dead-code split: server-only route exports (loader,
// action, headers, middleware) and the imports only they used must not reach
// the browser bundle; client-side exports (default, beforeLoad, clientLoader)
// must survive intact.

const ROUTE_SRC = `
import { readSecret } from "../lib/secrets.ts";
import { clientHelper } from "../lib/client-helper.ts";

export async function loader() {
  return { secret: readSecret("LOADER_ONLY_MARKER") };
}

export const action = async () => readSecret("ACTION_ONLY_MARKER");

export function headers() {
  return { "X-Marker": "HEADERS_ONLY_MARKER" };
}

export const middleware = [
  async (_ctx: unknown, next: () => Promise<Response>) => next(),
];

export async function beforeLoad() {
  return clientHelper("BEFORELOAD_MARKER");
}

export async function clientLoader() {
  return clientHelper("CLIENTLOADER_MARKER");
}

export default function Page() {
  return <main>COMPONENT_MARKER</main>;
}
`;

const SECRETS_SRC = `export function readSecret(k: string) { return "SECRET_SOURCE_MARKER:" + k; }`;
const HELPER_SRC = `export function clientHelper(k: string) { return k; }`;

/** Build a tiny app dir and bundle one route for the browser with the plugin. */
async function buildRouteChunk(): Promise<string> {
  const appDir = mkdtempSync(join(tmpdir(), "bract-shake-"));
  const routesDir = join(appDir, "routes");
  const libDir = join(appDir, "lib");
  for (const [dir, name, src] of [
    [routesDir, "page.tsx", ROUTE_SRC],
    [libDir, "secrets.ts", SECRETS_SRC],
    [libDir, "client-helper.ts", HELPER_SRC],
  ] as const) {
    Bun.spawnSync(["mkdir", "-p", dir]);
    writeFileSync(join(dir, name), src);
  }

  const result = await Bun.build({
    entrypoints: [join(routesDir, "page.tsx")],
    target: "browser",
    plugins: [routeShakePlugin(appDir)],
    external: ["react", "react/*"],
  });
  expect(result.success).toBe(true);
  return result.outputs[0].text();
}

describe("routeShakePlugin", () => {
  test("strips server-only exports and their imports; keeps client exports", async () => {
    const bundle = await buildRouteChunk();

    for (const name of SERVER_ONLY_ROUTE_EXPORTS) {
      expect(bundle).not.toContain(`${name.toUpperCase()}_ONLY_MARKER`);
    }
    // The import used only by loader/action must be gone entirely.
    expect(bundle).not.toContain("SECRET_SOURCE_MARKER");
    expect(bundle).not.toContain("readSecret");

    // Client-side surface survives.
    expect(bundle).toContain("COMPONENT_MARKER");
    expect(bundle).toContain("BEFORELOAD_MARKER");
    expect(bundle).toContain("CLIENTLOADER_MARKER");
  });

  test('leaves whole-module "use server" files to the proxy plugin', async () => {
    const appDir = mkdtempSync(join(tmpdir(), "bract-shake-us-"));
    const routesDir = join(appDir, "routes");
    Bun.spawnSync(["mkdir", "-p", routesDir]);
    const path = join(routesDir, "rpc.ts");
    writeFileSync(path, `"use server";\nexport async function doThing() { return "USE_SERVER_BODY"; }\n`);

    // With only the shake plugin registered, the file must pass through
    // untouched (the directive check defers) — in real builds the use-server
    // proxy plugin, registered before it, turns it into fetch proxies.
    const result = await Bun.build({
      entrypoints: [path],
      target: "browser",
      plugins: [routeShakePlugin(appDir)],
    });
    expect(result.success).toBe(true);
    expect(await result.outputs[0].text()).toContain("USE_SERVER_BODY");
  });

  test("does not touch modules outside routes/ and root.tsx", async () => {
    const appDir = mkdtempSync(join(tmpdir(), "bract-shake-out-"));
    const libDir = join(appDir, "lib");
    Bun.spawnSync(["mkdir", "-p", libDir]);
    const path = join(libDir, "util.ts");
    writeFileSync(path, `export function loader() { return "NOT_A_ROUTE_LOADER"; }\n`);

    const result = await Bun.build({
      entrypoints: [path],
      target: "browser",
      plugins: [routeShakePlugin(appDir)],
    });
    expect(result.success).toBe(true);
    expect(await result.outputs[0].text()).toContain("NOT_A_ROUTE_LOADER");
  });
});
