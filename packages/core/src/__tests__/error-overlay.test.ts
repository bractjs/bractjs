import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chosenEditor,
  editorArgs,
  framesForStack,
  handleOpenRequest,
  handleStackRequest,
  relocate,
} from "../dev/overlay-endpoints.ts";
import { mapChunkPosition } from "../dev/source-map.ts";
import { parseStack } from "../dev/stack.ts";

const TMP = resolve(import.meta.dir, ".tmp-error-overlay");
const OUT = resolve(TMP, "build/client");
const opts = { root: TMP, clientOutDir: OUT };

const SOURCE = `export function explode(n: number): number {
  const doubled = n * 2;
  if (doubled > 2) {
    throw new Error("boom");
  }
  return doubled;
}
`;

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(resolve(TMP, "app/routes"), { recursive: true });
  await writeFile(resolve(TMP, "app/routes/boom.ts"), SOURCE);
  // A dev-style client chunk: inline source map, sources relative to the out root.
  const built = await Bun.build({
    entrypoints: [resolve(TMP, "app/routes/boom.ts")],
    root: TMP,
    outdir: OUT,
    target: "browser",
    sourcemap: "inline",
    minify: false,
  });
  expect(built.success).toBe(true);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BractJS-Action": "1", ...headers },
    body: JSON.stringify(body),
  });

describe("parseStack", () => {
  test("V8 / Bun frames, with and without a function name", () => {
    expect(
      parseStack(
        "Error: boom\n    at async loader (/app/routes/x.tsx?v=3:5:9)\n    at /app/server.ts:10:2\n    at <anonymous>",
      ),
    ).toEqual([
      { fn: "loader", file: "/app/routes/x.tsx", line: 5, column: 9 },
      { fn: undefined, file: "/app/server.ts", line: 10, column: 2 },
    ]);
  });

  test("Firefox / Safari frames and URLs", () => {
    expect(parseStack("Page@http://localhost:3000/build/client/app.js:12:7")).toEqual([
      { fn: "Page", file: "http://localhost:3000/build/client/app.js", line: 12, column: 7 },
    ]);
  });
});

describe("source maps", () => {
  test("map a dev chunk position back to the source line", async () => {
    const chunk = resolve(OUT, "app/routes/boom.js");
    const code = await Bun.file(chunk).text();
    const lines = code.split("\n");
    const at = lines.findIndex((l) => l.includes('throw new Error("boom")'));
    expect(at).toBeGreaterThan(-1);
    const mapped = mapChunkPosition(chunk, OUT, at + 1, lines[at].indexOf("throw") + 1);
    expect(mapped?.source).toBe(resolve(TMP, "app/routes/boom.ts"));
    expect(mapped?.line).toBe(4);
    expect(mapped?.content).toContain("const doubled");
  });
});

describe("POST /_bractjs/stack", () => {
  test("server frames inside the project get code excerpts; outside frames are dropped", () => {
    const frames = framesForStack(
      `Error: boom\n    at explode (${resolve(TMP, "app/routes/boom.ts")}:4:11)\n    at x (/etc/passwd:1:1)`,
      opts,
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      fn: "explode",
      file: "app/routes/boom.ts",
      line: 4,
      column: 11,
      app: true,
    });
    expect(frames[0].excerpt.find((r) => r.line === 4)?.text).toBe('    throw new Error("boom");');
    expect(frames[0].excerpt[0].line).toBe(1);
  });

  test("browser frames map through the chunk's source map", async () => {
    const code = await Bun.file(resolve(OUT, "app/routes/boom.js")).text();
    const lines = code.split("\n");
    const at = lines.findIndex((l) => l.includes('throw new Error("boom")'));
    const col = lines[at].indexOf("throw") + 1;
    const res = await handleStackRequest(
      post("/_bractjs/stack", {
        stack: `explode@http://localhost:3000/build/client/app/routes/boom.js:${at + 1}:${col}`,
      }),
      opts,
    );
    const { frames } = (await res.json()) as { frames: Array<{ file: string; line: number }> };
    expect(frames[0]).toMatchObject({ file: "app/routes/boom.ts", line: 4 });
  });

  test("a frame in a build-time rewrite of the file is relocated to the original line", () => {
    const rewritten =
      'import { jsx } from "react/jsx-runtime";\nfunction explodeLater() {\n  throw new Error("x");\n}\n';
    const original =
      'import { useEffect } from "react";\n\nfunction explodeLater(): never {\n  throw new Error("x");\n}\n';
    expect(relocate(rewritten, original, 3)).toBe(4);
    expect(relocate(rewritten, original, 4)).toBeNull(); // "}" is too generic to place
  });

  test("a chunk URL can't climb out of the build directory", () => {
    expect(
      framesForStack("x@http://localhost:3000/build/client/%2e%2e/%2e%2e/app/routes/boom.ts:1:1", opts),
    ).toEqual([]);
  });

  test("a cross-site request is refused", async () => {
    const res = await handleStackRequest(
      new Request("http://localhost:3000/_bractjs/stack", {
        method: "POST",
        headers: { "Content-Type": "text/plain", "Sec-Fetch-Site": "cross-site" },
        body: JSON.stringify({ stack: "" }),
      }),
      opts,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /_bractjs/open", () => {
  test("opens a project file at the line in the editor", async () => {
    const launched: string[][] = [];
    const res = await handleOpenRequest(
      post("/_bractjs/open", { file: "app/routes/boom.ts", line: 4, column: 5 }),
      opts,
      (argv) => launched.push(argv),
    );
    expect(res.status).toBe(204);
    expect(launched).toHaveLength(1);
    expect(launched[0].at(-1)).toContain("app/routes/boom.ts");
  });

  test("refuses paths outside the project, bad lines, and cross-site requests", async () => {
    const launched: string[][] = [];
    const launch = (argv: string[]) => launched.push(argv);
    expect(
      (await handleOpenRequest(post("/_bractjs/open", { file: "../../../etc/passwd" }), opts, launch)).status,
    ).toBe(403);
    expect(
      (await handleOpenRequest(post("/_bractjs/open", { file: "/etc/passwd" }), opts, launch)).status,
    ).toBe(403);
    expect(
      (
        await handleOpenRequest(
          post("/_bractjs/open", { file: "app/routes/boom.ts", line: "4; rm -rf" }),
          opts,
          launch,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleOpenRequest(
          post(
            "/_bractjs/open",
            { file: "app/routes/boom.ts" },
            { "X-BractJS-Action": "", "Sec-Fetch-Site": "cross-site" },
          ),
          opts,
          launch,
        )
      ).status,
    ).toBe(403);
    expect(launched).toEqual([]);
  });

  test("editor command lines", () => {
    expect(editorArgs("code", "/p/a.ts", 4, 2)).toEqual(["code", "-g", "/p/a.ts:4:2"]);
    expect(editorArgs("/usr/local/bin/cursor", "/p/a.ts", 4, 2)).toEqual([
      "/usr/local/bin/cursor",
      "-g",
      "/p/a.ts:4:2",
    ]);
    expect(editorArgs("webstorm", "/p/a.ts", 4, 2)).toEqual([
      "webstorm",
      "--line",
      "4",
      "--column",
      "2",
      "/p/a.ts",
    ]);
    expect(editorArgs("nvim", "/p/a.ts", 4, 2)).toEqual(["nvim", "+4", "/p/a.ts"]);
    expect(editorArgs("my-editor", "/p/a.ts", 4, 2)).toEqual(["my-editor", "/p/a.ts"]);
    expect(chosenEditor({ BRACTJS_EDITOR: "zed", EDITOR: "vim" })).toBe("zed");
    expect(chosenEditor({})).toBe("code");
  });
});
