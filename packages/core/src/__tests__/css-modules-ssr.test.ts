// CSS Modules: SSR (source import + the runtime plugin) must render the same
// scoped class names as the client bundle, or hydration mismatches and the
// server HTML is unstyled.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cssModuleClassesChanged, installCssModulesRuntime } from "../server/css-modules-runtime.ts";

// Inside the package, so `react` resolves from the fixture.
const dir = resolve(import.meta.dir, ".tmp-css-modules");
let client: Record<string, string>;

beforeAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "card.module.css"),
    ".card { color: red; }\n.base { padding: 1px; }\n.button { composes: base; color: blue; }\n",
  );
  await writeFile(join(dir, "plain.css"), ".plain { color: green; }\n");
  await writeFile(
    join(dir, "route.tsx"),
    [
      'import styles from "./card.module.css";',
      'import "./plain.css";',
      "export default function Route() {",
      "  return <div className={styles.card}><button className={styles.button}>go</button></div>;",
      "}",
    ].join("\n"),
  );
  // Build the client once, before the server imports anything: this is what
  // the browser would receive.
  client = await clientClassNames();
  installCssModulesRuntime();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function clientClassNames(): Promise<Record<string, string>> {
  const result = await Bun.build({ entrypoints: [join(dir, "route.tsx")], target: "browser" });
  expect(result.success).toBe(true);
  const js = await result.outputs.find((o) => o.kind === "entry-point")!.text();
  const names: Record<string, string> = {};
  for (const [, key, value] of js.matchAll(/(\w+): "([^"]+)"/g)) names[key] = value;
  return names;
}

describe("CSS Modules SSR parity", () => {
  test("the server renders the client bundle's scoped class names", async () => {
    const mod = (await import(join(dir, "route.tsx"))) as { default: FunctionComponent };
    const html = renderToStaticMarkup(createElement(mod.default));

    expect(client.card).toMatch(/^card_/);
    expect(html).toContain(`class="${client.card}"`);
  });

  test("composes yields every composed class, as in the client bundle", async () => {
    const mod = (await import(join(dir, "route.tsx"))) as { default: FunctionComponent };
    const html = renderToStaticMarkup(createElement(mod.default));

    expect(client.button.split(" ")).toHaveLength(2);
    expect(html).toContain(`class="${client.button}"`);
  });

  test("the class map is the stylesheet's default export", async () => {
    const styles = (await import(join(dir, "card.module.css"))) as { default: Record<string, string> };
    expect(Object.keys(styles.default).sort()).toEqual(["base", "button", "card"]);
  });

  test("dev change detection: rule edits keep the map, class additions change it", async () => {
    const file = join(dir, "card.module.css");
    await writeFile(file, ".card { color: purple; }\n.base { padding: 2px; }\n.button { composes: base; }\n");
    expect(await cssModuleClassesChanged(file)).toBe(false);
    await writeFile(file, ".card { color: purple; }\n.base {}\n.button { composes: base; }\n.extra {}\n");
    expect(await cssModuleClassesChanged(file)).toBe(true);
  });

  test("a stylesheet the server never imported reports no change", async () => {
    expect(await cssModuleClassesChanged(join(dir, "never-loaded.module.css"))).toBe(false);
  });
});
