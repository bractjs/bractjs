import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serverModuleStubPlugin, serverOnlyPlugin } from "../build/env-plugin.ts";

let dir = "";

beforeAll(async () => {
  dir = join(tmpdir(), `bract-server-stub-${Date.now()}`);
  await mkdir(dir, { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function bundleClient(entry: string, plugin: typeof serverModuleStubPlugin): Promise<string> {
  const out = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    plugins: [plugin],
  });
  if (!out.success) throw new Error(out.logs.join("\n"));
  return await out.outputs[0].text();
}

// A realistic server module: imports a Bun builtin and exposes DB-ish helpers.
const SERVER_SRC = `import { Database } from "bun:sqlite";
const db = new Database(":memory:");
db.run("CREATE TABLE todos (id TEXT, secret TEXT)");
export const SUPER_SECRET = "do-not-ship-me";
export function listTodos() { return db.query("SELECT * FROM todos").all(); }
export async function addTodo(title) { db.run("INSERT INTO todos VALUES (?, ?)", [title, SUPER_SECRET]); }
export default { db };
`;

describe("serverModuleStubPlugin", () => {
  test("a route importing a *.server.ts (with bun:sqlite) builds instead of hard-failing", async () => {
    const server = join(dir, "store.server.ts");
    await writeFile(server, SERVER_SRC);
    const route = join(dir, "route-ok.tsx");
    await writeFile(
      route,
      `import { addTodo, listTodos } from "./store.server.ts";
       export async function loader() { return { todos: listTodos() }; }
       export async function action(fd) { await addTodo(fd.get("title")); return {}; }
       export default function Page() { return null; }
      `,
    );
    // Must not throw — the old serverOnlyPlugin would reject this import.
    const code = await bundleClient(route, serverModuleStubPlugin);
    expect(code).toContain("__bractServerStub");
  });

  test("zero server source reaches the client bundle", async () => {
    const server = join(dir, "store2.server.ts");
    await writeFile(server, SERVER_SRC);
    const route = join(dir, "route-leak.tsx");
    await writeFile(
      route,
      `import { addTodo, listTodos, SUPER_SECRET } from "./store2.server.ts";
       export async function loader() { return { todos: listTodos(), s: SUPER_SECRET }; }
       export async function action(fd) { await addTodo(fd.get("title")); return {}; }
       export default function Page() { return null; }
      `,
    );
    const code = await bundleClient(route, serverModuleStubPlugin);
    // None of the server internals may appear in the client output.
    expect(code).not.toContain("bun:sqlite");
    expect(code).not.toContain("do-not-ship-me");
    expect(code).not.toContain("INSERT INTO");
    expect(code).not.toContain("CREATE TABLE");
    expect(code).not.toContain("new Database");
  });

  test("named + default exports are preserved as resolvable stubs", async () => {
    const server = join(dir, "store3.server.ts");
    await writeFile(server, SERVER_SRC);
    const route = join(dir, "route-default.tsx");
    await writeFile(
      route,
      `import store, { listTodos } from "./store3.server.ts";
       export const a = typeof listTodos;
       export const b = typeof store;
       export default function Page() { return null; }
      `,
    );
    // If default/named stubs weren't emitted, the bundle would fail to resolve.
    const code = await bundleClient(route, serverModuleStubPlugin);
    expect(code).toContain("__bractServerStub");
  });

  test("a stub throws a clear error if actually invoked on the client", async () => {
    const server = join(dir, "store4.server.ts");
    await writeFile(server, SERVER_SRC);
    // Bundle just the server module so we can import and exercise the stub.
    const out = await Bun.build({
      entrypoints: [server],
      target: "browser",
      minify: false,
      format: "esm",
      plugins: [serverModuleStubPlugin],
    });
    if (!out.success) throw new Error(out.logs.join("\n"));
    const js = await out.outputs[0].text();
    // Import the bundled stub via a data: URL so we exercise the real emitted
    // code without depending on filesystem module resolution.
    const dataUrl = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
    const mod = (await import(dataUrl)) as { addTodo: (...a: unknown[]) => unknown };
    expect(() => mod.addTodo("x")).toThrow(/server\.ts|not.*available in the browser/);
  });

  test("legacy serverOnlyPlugin still hard-fails the same import", async () => {
    const server = join(dir, "store5.server.ts");
    await writeFile(server, SERVER_SRC);
    const route = join(dir, "route-legacy.tsx");
    // The import must be *used* (and have a side effect Bun can't drop), or Bun
    // tree-shakes the unused import and never loads the server module — meaning
    // the guard's throwing onLoad never fires.
    await writeFile(
      route,
      `import { listTodos } from "./store5.server.ts";
       export async function loader() { return { todos: listTodos() }; }
       export default function Page() { return null; }
      `,
    );
    // The guard's onLoad throws when the (used) server import is loaded. Bun
    // surfaces that as a rejected build, so assert the build does not succeed.
    let failed = false;
    try {
      const out = await Bun.build({
        entrypoints: [route],
        target: "browser",
        minify: false,
        plugins: [serverOnlyPlugin],
      });
      failed = !out.success;
    } catch {
      failed = true; // onLoad throw propagated as a rejection
    }
    expect(failed).toBe(true);
  });
});
