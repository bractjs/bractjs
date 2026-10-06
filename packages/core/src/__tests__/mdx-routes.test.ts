import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileMdxRoutes, frontmatterMeta, splitFrontmatter } from "../codegen/mdx.ts";
import { writeModuleRegistries } from "../codegen/module-registry.ts";
import { scanRoutes } from "../server/scanner.ts";
import { createTestApp } from "../testing-entry.ts";

const TMP = resolve(import.meta.dir, ".tmp-mdx");
const APP = resolve(TMP, "app");
const SRC = resolve(import.meta.dir, "..");

describe("frontmatter", () => {
  test("splits YAML from the body, keeping line numbers", () => {
    const { data, body } = splitFrontmatter("---\ntitle: Hello\ntags: [a, b]\n---\n# Hi\n", "x.mdx");
    expect(data).toEqual({ title: "Hello", tags: ["a", "b"] });
    expect(body).toBe("\n\n\n\n# Hi\n");
    expect(splitFrontmatter("# No frontmatter", "x.mdx")).toEqual({ data: {}, body: "# No frontmatter" });
  });

  test("rejects frontmatter that isn't key: value pairs", () => {
    expect(() => splitFrontmatter("---\n- a\n- b\n---\n", "x.mdx")).toThrow(
      "frontmatter must be key: value pairs",
    );
  });

  test("title and description become meta", () => {
    expect(frontmatterMeta({ title: "T", description: "D", other: 1 })).toEqual([
      { title: "T" },
      { name: "description", content: "D" },
    ]);
  });
});

describe("MDX routes", () => {
  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(resolve(APP, "routes/docs"), { recursive: true });
    await mkdir(resolve(APP, "components"), { recursive: true });
    await writeFile(
      resolve(APP, "root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
import { MetaTags } from "${SRC}/shared/meta-tags.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
    );
    await writeFile(
      resolve(APP, "components/Callout.tsx"),
      `export function Callout({ children }: { children: React.ReactNode }) { return <aside className="callout">{children}</aside>; }\n`,
    );
    await writeFile(
      resolve(APP, "mdx-components.tsx"),
      `export const components = { h1: (props) => <h1 className="doc-title" {...props} /> };\n`,
    );
    await writeFile(
      resolve(APP, "routes/docs/getting-started.mdx"),
      `---
title: Getting started
description: Install and run your first app
---
import { Callout } from "../../components/Callout.tsx";

# Getting started

Install it with \`bun add\`, then run **bractjs dev**.

<Callout>Run doctor if anything looks off.</Callout>
`,
    );
  });
  afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("compile to a sibling .mdx.tsx the scanner maps to the same URL", async () => {
    const result = await compileMdxRoutes(APP);
    expect(result.written).toEqual(["routes/docs/getting-started.mdx.tsx"]);
    const routes = await scanRoutes(APP);
    expect(routes.map((r) => [r.filePath, r.urlPattern])).toEqual([
      ["routes/docs/getting-started.mdx.tsx", "docs/getting-started"],
    ]);
  });

  test("render through the real pipeline: content, imported components, mdx-components, meta", async () => {
    const app = await createTestApp({ appDir: APP, serverEntry: false });
    const res = await app.get("/docs/getting-started");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1 class="doc-title">Getting started</h1>');
    expect(html).toContain("<code>bun add</code>");
    expect(html).toContain("<strong>bractjs dev</strong>");
    expect(html).toContain('<aside class="callout">Run doctor if anything looks off.</aside>');
    expect(html).toContain("<title>Getting started</title>");
    expect(html).toContain('<meta name="description" content="Install and run your first app"/>');
  });

  test("an up-to-date file isn't recompiled", async () => {
    expect((await compileMdxRoutes(APP)).written).toEqual([]);
  });

  test("the compiled binary's registry imports the compiled module", async () => {
    const { routesPath } = await writeModuleRegistries(APP);
    expect(await Bun.file(routesPath).text()).toContain('from "../routes/docs/getting-started.mdx.tsx"');
  });

  test("deleting the .mdx deletes its compiled module", async () => {
    await writeFile(resolve(APP, "routes/gone.mdx"), "# Gone\n");
    await compileMdxRoutes(APP);
    expect(existsSync(resolve(APP, "routes/gone.mdx.tsx"))).toBe(true);
    await rm(resolve(APP, "routes/gone.mdx"));
    expect((await compileMdxRoutes(APP)).removed).toEqual(["routes/gone.mdx.tsx"]);
    expect(existsSync(resolve(APP, "routes/gone.mdx.tsx"))).toBe(false);
  });

  test("a .mdx and a .tsx route for the same URL is an error", async () => {
    await writeFile(resolve(APP, "routes/clash.mdx"), "# Clash\n");
    await writeFile(resolve(APP, "routes/clash.tsx"), "export default function C() { return null; }\n");
    try {
      await expect(compileMdxRoutes(APP)).rejects.toThrow(
        "routes/clash.mdx and routes/clash.tsx are both routes",
      );
    } finally {
      await rm(resolve(APP, "routes/clash.mdx"));
      await rm(resolve(APP, "routes/clash.tsx"));
    }
  });

  test("a compile error names the file", async () => {
    await writeFile(resolve(APP, "routes/broken.mdx"), "# Broken\n\n<Unclosed>\n");
    try {
      await expect(compileMdxRoutes(APP)).rejects.toThrow("routes/broken.mdx");
    } finally {
      await rm(resolve(APP, "routes/broken.mdx"));
    }
  });
});
