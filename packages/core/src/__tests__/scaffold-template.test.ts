import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { fillTemplate } from "../../bin/scaffold-template.ts";

const TEMPLATE_DIR = resolve(import.meta.dir, "../../templates/new-app");
const VARS = { APP_NAME: "smoke-app", BRACT_PATH: "/opt/bractjs" };

describe("bractjs new template substitution", () => {
  test("fills placeholders with or without formatter-inserted spaces", () => {
    expect(fillTemplate("<title>{{APP_NAME}}</title>", VARS)).toBe("<title>smoke-app</title>");
    expect(fillTemplate("<title>{{ APP_NAME }}</title>", VARS)).toBe("<title>smoke-app</title>");
    expect(fillTemplate('"dep": "file:{{  BRACT_PATH  }}"', VARS)).toBe('"dep": "file:/opt/bractjs"');
    // Other double-brace expressions (JSX style objects) are left alone.
    expect(fillTemplate("<div style={{ color: 'red' }} />", VARS)).toBe("<div style={{ color: 'red' }} />");
  });

  // Regression: a formatter rewrote `{{APP_NAME}}` in root.tsx's <title> to
  // `{{ APP_NAME }}`, the exact-string replace missed it, and every app from
  // `bractjs new` (0.3.x–0.4.0) 500'd with "APP_NAME is not defined".
  test("no placeholder survives in any shipped template file", async () => {
    for await (const rel of new Bun.Glob("**/*").scan({ cwd: TEMPLATE_DIR, onlyFiles: true })) {
      const filled = fillTemplate(await Bun.file(join(TEMPLATE_DIR, rel)).text(), VARS);
      expect({ file: rel, leftover: filled.match(/\{\{\s*[A-Z_]+\s*\}\}/g) }).toEqual({
        file: rel,
        leftover: null,
      });
    }
    const root = fillTemplate(await Bun.file(join(TEMPLATE_DIR, "app/root.tsx")).text(), VARS);
    expect(root).toContain("<title>smoke-app</title>");
  });
});
