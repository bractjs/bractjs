import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prerenderPaths, runPrerender } from "../build/prerender.ts";
import { createServer } from "../server/serve.ts";

const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");
const TMP_BUILD = join(tmpdir(), `bract-prerender-${Date.now()}`);
const MANIFEST = { clientEntry: "/build/client/client.js", routes: {} };

// ── Unit: path mapping + safety ─────────────────────────────────────────────

describe("prerenderPaths", () => {
  test("maps / and nested paths to index.html + _data.json", () => {
    expect(prerenderPaths("/")).toEqual({ html: "index.html", data: "_data.json" });
    expect(prerenderPaths("/about")).toEqual({ html: "about/index.html", data: "about/_data.json" });
    expect(prerenderPaths("/blog/intro")).toEqual({
      html: "blog/intro/index.html",
      data: "blog/intro/_data.json",
    });
  });

  test("rejects route patterns instead of silently writing junk", () => {
    expect(() => prerenderPaths("/blog/:slug")).toThrow(/PATTERN/);
    expect(() => prerenderPaths("/blog/[slug]")).toThrow(/PATTERN/);
    expect(() => prerenderPaths("relative")).toThrow(/must start/);
  });

  test("rejects dot segments — these strings become filesystem writes", () => {
    expect(() => prerenderPaths("/../etc/passwd")).toThrow(/dot segments/);
    expect(() => prerenderPaths("/a/./b")).toThrow(/dot segments/);
  });
});

// ── Integration: generate + serve ───────────────────────────────────────────

describe("runPrerender + production serving", () => {
  let handle: ReturnType<typeof createServer>;
  const PORT = 3992;
  const BASE = `http://localhost:${PORT}`;

  beforeAll(async () => {
    const { written } = await runPrerender({
      prerender: ["/", "/counter"],
      appDir: FIXTURE_APP,
      buildDir: TMP_BUILD,
      manifest: MANIFEST,
    });
    expect(written.length).toBe(4); // 2 paths × (index.html + _data.json)

    // Overwrite one artifact with a sentinel so the serving test below can
    // prove the FILE was served, not a fresh SSR pass.
    await Bun.write(
      join(TMP_BUILD, "client", "_prerender", "counter", "index.html"),
      "<!-- PRERENDERED-SENTINEL -->",
    );

    handle = createServer({
      port: PORT,
      appDir: FIXTURE_APP,
      buildDir: TMP_BUILD,
      manifest: MANIFEST,
    });
  });

  afterAll(async () => {
    handle.stop();
    await rm(TMP_BUILD, { recursive: true, force: true });
  });

  test("writes real SSR output at build time", async () => {
    const html = await Bun.file(join(TMP_BUILD, "client", "_prerender", "index.html")).text();
    expect(html).toContain("hello from bractjs"); // loader ran during prerender
    const data = (await Bun.file(join(TMP_BUILD, "client", "_prerender", "_data.json")).json()) as {
      route: { message: string };
    };
    expect(data.route.message).toBe("hello from bractjs");
  });

  test("clean document GETs are served from the prerendered file", async () => {
    const res = await fetch(`${BASE}/counter`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("PRERENDERED-SENTINEL");
  });

  test("a query string opts back into dynamic SSR", async () => {
    const res = await fetch(`${BASE}/counter?fresh=1`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("PRERENDERED-SENTINEL");
  });

  test("clean /_data is served from the prerendered payload; queried /_data stays dynamic", async () => {
    const filed = await fetch(`${BASE}/_data?path=/`);
    expect(filed.headers.get("cache-control")).toContain("must-revalidate");
    const data = (await filed.json()) as { route: { message: string } };
    expect(data.route.message).toBe("hello from bractjs");

    // With a query the file is skipped — the loader runs (search echoes back).
    const dynamic = await fetch(`${BASE}/_data?path=${encodeURIComponent("/?q=1")}`);
    const dyn = (await dynamic.json()) as { search: Record<string, unknown> };
    expect(dyn.search).toEqual({ q: "1" });
  });

  test("non-prerendered paths fall through to dynamic SSR", async () => {
    const res = await fetch(`${BASE}/search-demo?page=2`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"search":{"page":2}');
  });
});
