// "use server" calls end to end: the generated client proxy (built for the
// browser) talks to the real /_action handler. Covers React 19 form actions —
// <form action={fn}> passes (formData), useActionState passes
// (prevState, formData) — plus redirects, HttpErrors and loader revalidation.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createUseServerProxyPlugin } from "../build/directives.ts";
import { serverModuleStubPlugin } from "../build/env-plugin.ts";
import { handleActionRequest } from "../server/action-handler.ts";
import { loadServerActionsFromRegistry } from "../server/action-registry.ts";
import { redirect } from "../server/response.ts";
import { HttpError } from "../shared/errors.ts";

const dir = resolve(import.meta.dir, ".tmp-server-action-forms");

// What the server runs for each exported action.
const serverImpl = {
  echo: async (...args: unknown[]) =>
    args.map((a) =>
      a instanceof FormData
        ? {
            form: Object.fromEntries(
              [...a.entries()].map(([k, v]) => [
                k,
                typeof v === "string" ? v : `file:${(v as File).name}:${(v as File).size}`,
              ]),
            ),
          }
        : a,
    ),
  save: async (_prev: unknown, form: FormData) => ({ ok: `saved ${String(form.get("title"))}` }),
  goHome: async () => {
    throw redirect("/home");
  },
  goAway: async () => redirect("https://evil.example/"),
  forbidden: async () => {
    throw new HttpError(403, "Not yours");
  },
};

type Proxies = Record<keyof typeof serverImpl, (...args: unknown[]) => Promise<unknown>>;
let client: Proxies;
const routerCalls: string[] = [];
// bun test runs every file in one process: put the globals back afterwards.
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  // The client never sees these bodies — only the export names matter.
  await writeFile(
    join(dir, "actions.server.ts"),
    `"use server";\n` +
      Object.keys(serverImpl)
        .map((name) => `export async function ${name}(..._a: unknown[]) { return null; }`)
        .join("\n"),
  );
  const out = await Bun.build({
    entrypoints: [join(dir, "actions.server.ts")],
    target: "browser",
    // Same order as the real client build: the *.server.ts stub runs first and
    // must hand "use server" modules to the proxy instead of stubbing them.
    plugins: [serverModuleStubPlugin, createUseServerProxyPlugin(dir)],
  });
  if (!out.success) throw new AggregateError(out.logs);
  await writeFile(join(dir, "client.js"), await out.outputs[0].text());
  client = (await import(join(dir, "client.js"))) as Proxies;

  await loadServerActionsFromRegistry([{ relPath: "actions.server.ts", mod: serverImpl }]);

  // The browser's fetch, answered by the real handler (same-origin, as the
  // CSRF gate requires).
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("Origin", "http://localhost");
    const res = await handleActionRequest(new Request(`http://localhost${url}`, { ...init, headers }));
    return res ?? new Response("not handled", { status: 500 });
  }) as typeof fetch;
  (globalThis as { __BRACTJS_ROUTER__?: unknown }).__BRACTJS_ROUTER__ = {
    revalidate: async () => {
      routerCalls.push("revalidate");
    },
    navigate: async (to: string) => {
      routerCalls.push(`navigate:${to}`);
    },
  };
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  delete (globalThis as { __BRACTJS_ROUTER__?: unknown }).__BRACTJS_ROUTER__;
  await rm(dir, { recursive: true, force: true });
});

describe('"use server" form actions', () => {
  test("useActionState's (prevState, formData) arrives intact", async () => {
    const form = new FormData();
    form.set("title", "Write docs");
    routerCalls.length = 0;
    expect(await client.save({ ok: "earlier" }, form)).toEqual({ ok: "saved Write docs" });
    // The page's loaders re-run after the action, as after a <Form>.
    expect(routerCalls).toEqual(["revalidate"]);
  });

  test("mixed arguments keep their order, values and files", async () => {
    const form = new FormData();
    form.append("tag", "a");
    form.append("tag", "b");
    form.append("upload", new File(["hello"], "note.txt"));
    const result = await client.echo(1, { deep: [true] }, form, "last");
    expect(result).toEqual([1, { deep: [true] }, { form: { tag: "b", upload: "file:note.txt:5" } }, "last"]);
  });

  test("a lone FormData (<form action={fn}>) still works", async () => {
    const form = new FormData();
    form.set("q", "x");
    expect(await client.echo(form)).toEqual([{ form: { q: "x" } }]);
  });

  test("JSON-only calls are unchanged", async () => {
    expect(await client.echo("a", 2)).toEqual(["a", 2]);
  });

  test("a thrown redirect soft-navigates instead of failing", async () => {
    routerCalls.length = 0;
    expect(await client.goHome()).toBeUndefined();
    expect(routerCalls).toEqual(["navigate:/home"]);
  });

  test("an off-origin redirect is blocked", async () => {
    routerCalls.length = 0;
    await expect(client.goAway()).rejects.toThrow();
    expect(routerCalls).toEqual([]);
  });

  test("an HttpError rejects with its message and status", async () => {
    const err = (await client.forbidden().catch((e: unknown) => e)) as Error & { status?: number };
    expect(err.message).toBe("Not yours");
    expect(err.status).toBe(403);
  });
});

describe("/_action argument decoding", () => {
  // The registry id of actions.server.ts#echo: SHA-256("relPath#name"), first 16 hex chars.
  const echoId = async () => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("actions.server.ts#echo"));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  };
  const post = async (body: FormData) =>
    handleActionRequest(
      new Request(`http://localhost/_action?id=${await echoId()}`, {
        method: "POST",
        headers: { Origin: "http://localhost" },
        body,
      }),
    );

  test("a marker only becomes a form at its own position", async () => {
    const body = new FormData();
    body.set("__bract_args", JSON.stringify([{ $bractForm: 1 }, { $bractForm: 1 }]));
    body.set("1:a", "x");
    const res = await post(body);
    expect(await res?.json()).toEqual([{ $bractForm: 1 }, { form: { a: "x" } }]);
  });

  test("rejects malformed or prototype-polluting __bract_args", async () => {
    for (const encoded of ["not json", '{"a":1}', '[{"__proto__":{"x":1}}]']) {
      const body = new FormData();
      body.set("__bract_args", encoded);
      const res = await post(body);
      expect(res?.status).toBe(400);
    }
  });
});

describe("where server actions may live", () => {
  test("a directive outside routes/ and *.server.ts is proxied, with a build warning", async () => {
    await writeFile(join(dir, "helpers.ts"), `"use server";\nexport async function stray() { return 1; }\n`);
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (msg: string) => warnings.push(String(msg));
    try {
      const out = await Bun.build({
        entrypoints: [join(dir, "helpers.ts")],
        target: "browser",
        plugins: [serverModuleStubPlugin, createUseServerProxyPlugin(dir)],
      });
      const js = await out.outputs[0].text();
      expect(js).toContain("/_action?id=");
      expect(js).not.toContain("return 1");
    } finally {
      console.warn = warn;
    }
    expect(warnings.join("\n")).toContain('"use server" in helpers.ts is ignored');
    expect(warnings.join("\n")).toContain("helpers.server.ts");
  });
});
