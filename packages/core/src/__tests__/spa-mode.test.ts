import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";

const PORT = 3993;
const BASE = `http://localhost:${PORT}`;
const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

let handle: ReturnType<typeof createServer>;

beforeAll(() => {
  handle = createServer({
    port: PORT,
    appDir: FIXTURE_APP,
    ssr: false,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
  });
});

afterAll(() => {
  handle.stop();
});

describe("SPA mode (config ssr: false)", () => {
  test("document GETs return the static shell — no loader data, ssrMode spa", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('"ssrMode":"spa"');
    // The index loader must not have run for the document.
    expect(html).not.toContain("hello from bractjs");
  });

  test("every matching document path serves the same shell", async () => {
    const a = await (await fetch(`${BASE}/`)).text();
    const b = await (await fetch(`${BASE}/counter`)).text();
    expect(b).toContain('"ssrMode":"spa"');
    expect(b).toBe(a);
  });

  test("unmatched paths still 404", async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("/_data still runs loaders — SPA mode is 'no document SSR', not 'no server'", async () => {
    const res = await fetch(`${BASE}/_data?path=/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { route: { message: string } };
    expect(data.route.message).toBe("hello from bractjs");
  });

  test("actions still work, with the CSRF gate intact", async () => {
    // Same-origin mutation with the header → allowed.
    const ok = await fetch(`${BASE}/counter`, {
      method: "POST",
      body: new FormData(),
      headers: { Origin: BASE, "X-BractJS-Action": "1" },
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);

    // Cross-origin mutation → blocked exactly as in SSR mode.
    const blocked = await fetch(`${BASE}/counter`, {
      method: "POST",
      body: new FormData(),
      headers: { Origin: "https://evil.example" },
    });
    expect(blocked.status).toBe(403);
  });

  test("beforeLoad-gated /_data stays gated in SPA mode", async () => {
    const res = await fetch(`${BASE}/_data?path=/protected`);
    expect(res.status).toBe(403);
  });
});
