import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectCssBundles } from "../build/css-collect.ts";
import { generateManifest } from "../build/manifest.ts";
import { renderRoute, type ServerManifest } from "../server/render.ts";

// The zero-config CSS pipeline: Bun extracts stylesheets into real files, the
// build records them per route in the manifest, and renderRoute emits <link>
// tags into the STREAMED HTML. The property that matters throughout is that
// styles arrive as real <link>s in the server response — not injected from JS
// after hydration, which is what caused a flash of unstyled content and left
// no-JS clients unstyled entirely.

const GLOBAL_CSS = `.global-banner { color: rebeccapurple; }`;
const MODULE_CSS = `.card { border: 1px solid red; }\n.title { font-weight: 700; }`;
const ROUTE_A_CSS = `.route-a-only { color: green; }`;

/**
 * Bundle a small app the way the real client build does (one entrypoint per
 * route, splitting on, metafile on) and return the outputs plus the collected
 * entry→CSS mapping.
 */
async function buildFixture(): Promise<{
  outdir: string;
  cssByEntry: Map<string, string[]>;
  entries: Record<string, string>;
}> {
  const dir = mkdtempSync(join(tmpdir(), "bract-css-"));
  const src = join(dir, "src");
  mkdirSync(src, { recursive: true });

  writeFileSync(join(src, "global.css"), GLOBAL_CSS);
  writeFileSync(join(src, "styles.module.css"), MODULE_CSS);
  writeFileSync(join(src, "a.css"), ROUTE_A_CSS);
  // root imports the app-wide stylesheet
  writeFileSync(
    join(src, "root.tsx"),
    `import "./global.css";\nexport default function Root() { return null; }\n`,
  );
  // routeA has its own CSS + a CSS module
  writeFileSync(
    join(src, "routeA.tsx"),
    `import "./a.css";\nimport s from "./styles.module.css";\nexport default function A() { return s.card + s.title; }\n`,
  );
  // routeB has no CSS at all
  writeFileSync(join(src, "routeB.tsx"), `export default function B() { return "b"; }\n`);

  const outdir = join(dir, "out");
  const result = await Bun.build({
    entrypoints: [join(src, "root.tsx"), join(src, "routeA.tsx"), join(src, "routeB.tsx")],
    target: "browser",
    splitting: true,
    outdir,
    metafile: true,
    minify: false,
  });
  expect(result.success).toBe(true);

  return {
    outdir,
    cssByEntry: collectCssBundles(result.metafile, outdir),
    entries: {
      root: resolve(outdir, "root.js"),
      routeA: resolve(outdir, "routeA.js"),
      routeB: resolve(outdir, "routeB.js"),
    },
  };
}

describe("CSS extraction", () => {
  test("emits a real .css file per entry-point that imports CSS", async () => {
    const { outdir, cssByEntry, entries } = await buildFixture();

    const files = readdirSync(outdir);
    expect(files.some((f) => f.endsWith(".css"))).toBe(true);

    // Each CSS-importing entry maps to at least one bundle on disk.
    for (const key of ["root", "routeA"] as const) {
      const css = cssByEntry.get(entries[key]);
      expect(css, `${key} should have a CSS bundle`).toBeDefined();
      expect(css!.length).toBeGreaterThan(0);
      expect(readFileSync(css![0], "utf8").length).toBeGreaterThan(0);
    }
  });

  test("a route with no CSS gets no bundle", async () => {
    const { cssByEntry, entries } = await buildFixture();
    expect(cssByEntry.get(entries.routeB)).toBeUndefined();
  });

  test("CSS is split per route — route A's styles are not in root's bundle", async () => {
    const { cssByEntry, entries } = await buildFixture();

    const rootCss = readFileSync(cssByEntry.get(entries.root)![0], "utf8");
    const routeACss = readFileSync(cssByEntry.get(entries.routeA)![0], "utf8");

    expect(routeACss).toContain("route-a-only");
    expect(rootCss).not.toContain("route-a-only");
    expect(rootCss).toContain("global-banner");
  });
});

describe("CSS modules", () => {
  test("class names are scoped, and the CSS is extracted rather than injected from JS", async () => {
    const { cssByEntry, entries, outdir } = await buildFixture();

    const js = readFileSync(entries.routeA, "utf8");
    const css = readFileSync(cssByEntry.get(entries.routeA)![0], "utf8");

    // Scoped: the raw class name is rewritten to a hashed one in BOTH the JS
    // class map and the emitted CSS, and they agree.
    const scoped = js.match(/card:\s*"([^"]+)"/)?.[1];
    expect(scoped, "expected a scoped class-name map in the route chunk").toBeDefined();
    expect(scoped).not.toBe("card");
    expect(css).toContain("." + scoped);

    // Regression guard for the FOUC bug: no client chunk may build a <style>
    // tag at runtime to deliver CSS.
    for (const f of readdirSync(outdir).filter((n) => n.endsWith(".js"))) {
      const contents = readFileSync(join(outdir, f), "utf8");
      expect(contents, `${f} must not inject styles at runtime`).not.toContain("createElement('style')");
      expect(contents, `${f} must not inject styles at runtime`).not.toContain('createElement("style")');
    }
  });
});

describe("manifest", () => {
  test("records per-route CSS and omits the key when a route has none", () => {
    const manifest = generateManifest({
      clientEntry: "/build/client/client.abc.js",
      rootChunk: "/build/client/app/root.def.js",
      routeChunks: new Map([
        ["about", "/build/client/app/routes/about.111.js"],
        ["contact", "/build/client/app/routes/contact.222.js"],
      ]),
      routeCss: new Map([["about", ["/build/client/app/routes/about.333.css"]]]),
      rootCss: ["/build/client/app/root.444.css"],
      mode: "production",
    });

    expect(manifest.routes.about.css).toEqual(["/build/client/app/routes/about.333.css"]);
    expect("css" in manifest.routes.contact).toBe(false);
    expect(manifest.rootCss).toEqual(["/build/client/app/root.444.css"]);
    // entryCss was not supplied — the key should be absent, not `undefined`.
    expect("entryCss" in manifest).toBe(false);
  });

  test("a manifest with no CSS is byte-identical to the pre-CSS shape", () => {
    const manifest = generateManifest({
      clientEntry: "/build/client/client.abc.js",
      routeChunks: new Map([["about", "/build/client/app/routes/about.111.js"]]),
      mode: "production",
    });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual({
      version: 1,
      mode: "production",
      clientEntry: "/build/client/client.abc.js",
      routes: { about: { chunk: "/build/client/app/routes/about.111.js", pattern: "about" } },
    });
  });
});

describe("collectCssBundles", () => {
  test("accepts the metafile as an already-parsed object or a JSON string", () => {
    const outdir = "/tmp/out";
    const meta = { outputs: { "./route.js": { cssBundle: "./route.css" } } };
    const expected = new Map([["/tmp/out/route.js", ["/tmp/out/route.css"]]]);

    expect(collectCssBundles(meta, outdir)).toEqual(expected);
    expect(collectCssBundles(JSON.stringify(meta), outdir)).toEqual(expected);
  });

  test("degrades to an empty map instead of throwing on missing or malformed input", () => {
    expect(collectCssBundles(undefined, "/tmp/out").size).toBe(0);
    expect(collectCssBundles("{not json", "/tmp/out").size).toBe(0);
    expect(collectCssBundles({}, "/tmp/out").size).toBe(0);
  });
});

describe("document rendering", () => {
  const manifest: ServerManifest = {
    clientEntry: "/build/client/client.abc.js",
    entryCss: ["/build/client/client.entry.css"],
    rootCss: ["/build/client/app/root.root.css"],
    routes: {
      about: { file: "", chunk: "/build/client/about.js", css: ["/build/client/about.css"] },
      contact: { file: "", chunk: "/build/client/contact.js", css: ["/build/client/contact.css"] },
    },
  };

  /**
   * The hrefs of the actual `<link rel="stylesheet">` elements, in document
   * order. Substring matching on the raw HTML is not enough: renderRoute also
   * serializes the whole manifest into `window.__BRACTJS_DATA__`, so every
   * route's CSS path appears somewhere in the document regardless.
   */
  function stylesheetHrefs(html: string): string[] {
    return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(
      (tag) => tag[0].match(/\bhref="([^"]+)"/)?.[1] ?? "",
    );
  }

  async function renderHtml(routePattern?: string): Promise<string> {
    const res = await renderRoute({
      shell: null,
      loaderData: {},
      actionData: null,
      params: {},
      pathname: "/about",
      manifest,
      meta: [],
      routePattern,
    });
    return await res.text();
  }

  test("links entry, root, and matched-route CSS in the streamed HTML", async () => {
    const hrefs = stylesheetHrefs(await renderHtml("about"));
    expect(hrefs).toContain("/build/client/client.entry.css");
    expect(hrefs).toContain("/build/client/app/root.root.css");
    expect(hrefs).toContain("/build/client/about.css");
  });

  test("does not link another route's CSS", async () => {
    expect(stylesheetHrefs(await renderHtml("about"))).not.toContain("/build/client/contact.css");
  });

  test("base CSS precedes route CSS so the route wins the cascade", async () => {
    const hrefs = stylesheetHrefs(await renderHtml("about"));
    expect(hrefs.indexOf("/build/client/app/root.root.css")).toBeLessThan(
      hrefs.indexOf("/build/client/about.css"),
    );
  });

  test("renders without route CSS when there is no matched route (SPA shell)", async () => {
    const hrefs = stylesheetHrefs(await renderHtml(undefined));
    expect(hrefs).toContain("/build/client/app/root.root.css");
    expect(hrefs).not.toContain("/build/client/about.css");
  });

  test("a manifest carrying no CSS emits no stylesheet links", async () => {
    const res = await renderRoute({
      shell: null,
      loaderData: {},
      actionData: null,
      params: {},
      pathname: "/about",
      manifest: { clientEntry: "/build/client/client.abc.js", routes: {} },
      meta: [],
    });
    expect(stylesheetHrefs(await res.text())).toEqual([]);
  });
});
