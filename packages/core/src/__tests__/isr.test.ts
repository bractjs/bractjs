import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runPrerender } from "../build/prerender.ts";
import { createIsr, normalizeIsrPath, revalidatePath } from "../server/isr.ts";
import { buildFetchHandler } from "../server/serve.ts";

describe("createIsr", () => {
  function setup(files: Record<string, string>, render: (path: string) => Promise<string | number>) {
    let clock = 1_000_000;
    let renders = 0;
    const isr = createIsr({
      now: () => clock,
      load: async (rel) => files[rel] ?? null,
      render: async (path) => {
        renders++;
        const out = await render(path);
        return typeof out === "number"
          ? { html: new Response("err", { status: out }), data: new Response("err", { status: out }) }
          : { html: new Response(out), data: new Response(JSON.stringify({ html: out })) };
      },
    });
    return {
      isr,
      tick: (ms: number) => (clock += ms),
      renders: () => renders,
    };
  }
  const manifest = (generatedAt: number) => JSON.stringify({ generatedAt, routes: { "/news": 60, "/": 10 } });

  test("serves the build's copy while fresh, then regenerates once in the background", async () => {
    let version = 0;
    const t = setup(
      { "_isr.json": manifest(1_000_000), "news/index.html": "build", "news/_data.json": '{"v":"build"}' },
      async () => `fresh ${++version}`,
    );
    const first = await t.isr.serve("/news", "html");
    expect(await first?.text()).toBe("build");
    expect(first?.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
    );
    expect(t.renders()).toBe(0);

    t.tick(61_000);
    // Stale: still the old copy, and only ONE regeneration for concurrent hits.
    const [a, b] = await Promise.all([t.isr.serve("/news", "html"), t.isr.serve("/news/", "html")]);
    expect([await a?.text(), await b?.text()]).toEqual(["build", "build"]);
    await Bun.sleep(0);
    expect(t.renders()).toBe(1);
    expect(await (await t.isr.serve("/news", "html"))?.text()).toBe("fresh 1");
    expect(await (await t.isr.serve("/news", "data"))?.text()).toBe('{"html":"fresh 1"}');
  });

  test("a failed regeneration keeps the previous copy", async () => {
    const t = setup({ "_isr.json": manifest(0), "news/index.html": "build" }, async () => 500);
    expect(await (await t.isr.serve("/news", "html"))?.text()).toBe("build");
    expect(await t.isr.revalidate("/news")).toBe(false);
    expect(await (await t.isr.serve("/news", "html"))?.text()).toBe("build");
  });

  test("paths that aren't ISR pages, and apps without _isr.json, fall through", async () => {
    const t = setup({ "_isr.json": manifest(0) }, async () => "x");
    expect(await t.isr.serve("/other", "html")).toBeNull();
    const none = setup({}, async () => "x");
    expect(await none.isr.serve("/news", "html")).toBeNull();
  });

  test("path normalization", () => {
    expect(normalizeIsrPath("/")).toBe("/");
    expect(normalizeIsrPath("/a/")).toBe("/a");
    expect(normalizeIsrPath("/a")).toBe("/a");
  });
});

describe("ISR end to end", () => {
  const APP = resolve(import.meta.dir, ".tmp-isr/app");
  const BUILD = resolve(import.meta.dir, ".tmp-isr/build");
  const SRC = resolve(import.meta.dir, "..");
  const MANIFEST = { clientEntry: "/build/client/client.js", routes: {} };
  const g = globalThis as { __isrCount?: number };

  beforeAll(async () => {
    await rm(resolve(import.meta.dir, ".tmp-isr"), { recursive: true, force: true });
    await mkdir(join(APP, "routes"), { recursive: true });
    await writeFile(
      join(APP, "root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
    );
    await writeFile(
      join(APP, "routes/news.tsx"),
      `import { useLoaderData } from "${SRC}/index.ts";
export const config = { revalidate: 3600 };
export function loader() { globalThis.__isrCount = (globalThis.__isrCount ?? 0) + 1; return { n: globalThis.__isrCount }; }
export default function News() { const { n } = useLoaderData(); return <p>render {n}</p>; }
`,
    );
    await writeFile(
      join(APP, "routes/plain.tsx"),
      `export default function Plain() { return <p>plain</p>; }\n`,
    );
    g.__isrCount = 0;
    await runPrerender({ prerender: ["/news", "/plain"], appDir: APP, buildDir: BUILD, manifest: MANIFEST });
  });
  afterAll(async () => {
    await rm(resolve(import.meta.dir, ".tmp-isr"), { recursive: true, force: true });
  });

  test("the build records ISR pages only", async () => {
    const isrJson = (await Bun.file(join(BUILD, "client/_prerender/_isr.json")).json()) as { routes: object };
    expect(isrJson.routes).toEqual({ "/news": 3600 });
  });

  test("serves the build's copy, and revalidatePath() regenerates it", async () => {
    const handler = buildFetchHandler({ appDir: APP, buildDir: BUILD, manifest: MANIFEST });
    const first = await handler(new Request("http://x/news"));
    expect(await first.text()).toContain("render <!-- -->1");
    expect(first.headers.get("Cache-Control")).toContain("s-maxage=3600");

    expect(await revalidatePath("/news")).toBe(true);
    const after = await (await handler(new Request("http://x/news"))).text();
    // The loader ran for the build's document (1) and /_data (2), then for
    // the regenerated document (3) and /_data payload (4).
    expect(after).toContain("render <!-- -->3");
    const data = (await (await handler(new Request("http://x/_data?path=%2Fnews"))).json()) as {
      route: { n: number };
    };
    expect(data.route.n).toBe(4); // the /_data payload regenerated alongside
    expect(await revalidatePath("/plain")).toBe(false);
  });

  test("the regeneration header without the server's secret doesn't bypass the cache", async () => {
    const handler = buildFetchHandler({ appDir: APP, buildDir: BUILD, manifest: MANIFEST });
    const before = g.__isrCount;
    await handler(new Request("http://x/news", { headers: { "X-BractJS-ISR-Regenerate": "guess" } }));
    expect(g.__isrCount).toBe(before);
  });
});
