import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";

const PORT = 3994;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

let handle: ReturnType<typeof createServer>;

beforeAll(() => {
  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
});

afterAll(() => {
  handle.stop();
});

/** The rendered document without the __BRACTJS_DATA__ script island. */
function withoutScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, "");
}

describe("ssr: false (client-only)", () => {
  test("document SSR renders the Fallback, never the component or loader data", async () => {
    const res = await fetch(`${BASE}/client-only`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const rendered = withoutScripts(html);
    expect(rendered).toContain("client-only fallback");
    expect(rendered).not.toContain("client-only component");
    // The loader must not have run at all — its data appears nowhere, not
    // even in the bootstrap payload.
    expect(html).not.toContain("CLIENT-ONLY-LOADER-DATA");
    expect(html).toContain('"ssrMode":"client-only"');
  });

  test("/_data DOES run the loader — that is how the client completes the render", async () => {
    const res = await fetch(`${BASE}/_data?path=/client-only`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { route: { secret: string } };
    expect(data.route.secret).toBe("CLIENT-ONLY-LOADER-DATA");
  });

  test("beforeLoad still gates the document — ssr:false is not an auth bypass", async () => {
    const res = await fetch(`${BASE}/protected-client-only`);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain("GATED-CLIENT-ONLY-DATA");
  });

  test("beforeLoad still gates /_data for ssr:false routes", async () => {
    const res = await fetch(`${BASE}/_data?path=/protected-client-only`);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain("GATED-CLIENT-ONLY-DATA");
  });
});

describe('ssr: "data-only"', () => {
  test("loaders run (data in bootstrap) but the Fallback renders in the component's place", async () => {
    const res = await fetch(`${BASE}/data-only`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const rendered = withoutScripts(html);
    expect(rendered).toContain("data-only fallback");
    expect(rendered).not.toContain("data-only component");
    // Loader data IS present — in the bootstrap payload only.
    expect(html).toContain("DATA-ONLY-LOADER-DATA");
    expect(html).toContain('"ssrMode":"data-only"');
  });
});

describe("default routes are untouched", () => {
  test("a normal route still fully SSRs with no ssrMode marker", async () => {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    expect(withoutScripts(html)).toContain("Index page content");
    expect(html).not.toContain('"ssrMode"');
  });
});
