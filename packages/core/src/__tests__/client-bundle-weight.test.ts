import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Route modules import client hooks from the package barrel
// (`import { Link, useLoaderData } from "@bractjs/bractjs"`), and that barrel
// also re-exports server code (createServer → render.ts → react-dom/server).
// Only package.json's `sideEffects` allowlist lets the bundler drop the unused
// server half — without it every route chunk shipped ~64 KB gz of
// react-dom/server to the browser. Conversely, listing too little drops the
// client entry's hydrateRoot() call and the app never hydrates.

const PKG_ROOT = resolve(import.meta.dir, "../..");

const ROUTE_SRC = `
import { Link, useLoaderData } from "@bractjs/bractjs";
export default function Page() {
  const data = useLoaderData<{ msg: string }>();
  return <Link to="/">{data.msg}</Link>;
}
`;

/** Build a route + the client entry shim the way runBuild's client pass does. */
async function buildClient(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "bract-weight-"));
  const scope = join(dir, "node_modules", "@bractjs");
  mkdirSync(scope, { recursive: true });
  // Resolve the framework through node_modules like a real app, so the
  // package's own package.json (and its sideEffects field) is in effect.
  symlinkSync(PKG_ROOT, join(scope, "bractjs"), "dir");
  for (const dep of ["react", "react-dom"]) {
    symlinkSync(join(PKG_ROOT, "node_modules", dep), join(dir, "node_modules", dep), "dir");
  }
  writeFileSync(join(dir, "page.tsx"), ROUTE_SRC);
  writeFileSync(join(dir, "shim.ts"), `import "${join(PKG_ROOT, "src/client/entry.tsx")}";\nexport {};\n`);

  const result = await Bun.build({
    entrypoints: [join(dir, "shim.ts"), join(dir, "page.tsx")],
    target: "browser",
    splitting: true,
    outdir: join(dir, "out"),
    minify: true,
  });
  expect(result.success).toBe(true);
  return (await Promise.all(result.outputs.map((o) => o.text()))).join("\n");
}

describe("client bundle weight", () => {
  // One build shared by both assertions — cheaper, and back-to-back Bun.build
  // calls on the same graph intermittently fail on Bun 1.3.x ("Unexpected
  // reading file").
  let js = "";
  beforeAll(async () => {
    js = await buildClient();
  });

  test("react-dom/server never reaches the browser bundle", () => {
    // Booleans, not toContain: a failure would otherwise print the whole bundle.
    expect({ hasReactDomServer: js.includes("ReactDOMServer") }).toEqual({ hasReactDomServer: false });
    expect({ hasStaticMarkup: js.includes("renderToStaticMarkup") }).toEqual({ hasStaticMarkup: false });
  });

  test("the client entry keeps its hydration side effect", () => {
    expect({ hasHydrateRoot: js.includes("hydrateRoot") }).toEqual({ hasHydrateRoot: true });
  });

  test("every sideEffects allowlist entry exists (a rename would silently drop it)", async () => {
    const pkg = await Bun.file(join(PKG_ROOT, "package.json")).json();
    expect(Array.isArray(pkg.sideEffects)).toBe(true);
    for (const rel of pkg.sideEffects as string[]) {
      expect(existsSync(join(PKG_ROOT, rel))).toBe(true);
    }
  });
});
