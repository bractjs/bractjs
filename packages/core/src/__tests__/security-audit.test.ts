// Regression tests for the 2026-09 security audit. Each block pins one finding
// so a future refactor can't silently reopen it.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveRouteChain } from "../server/layout.ts";

const TMP = resolve(import.meta.dir, ".tmp-security-audit");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(join(TMP, "routes", "admin"), { recursive: true });
  await Bun.write(join(TMP, "root.tsx"), `export default function Root() { return null; }\n`);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("layout.ts gates (dev / bractjs start path)", () => {
  // Codegen + the compiled binary honor `layout.ts` as well as `layout.tsx`.
  // The filesystem path used by `bractjs dev` and `bractjs start` must too —
  // otherwise a guard-only `layout.ts` (middleware/beforeLoad, no JSX) is
  // enforced in the binary but silently skipped everywhere else.
  test("a guard-only routes/<dir>/layout.ts joins the chain", async () => {
    await Bun.write(
      join(TMP, "routes", "admin", "layout.ts"),
      `export const middleware = [async () => new Response("DENIED", { status: 401 })];\n`,
    );
    await Bun.write(
      join(TMP, "routes", "admin", "secret.tsx"),
      `export default function S() { return null; }\n`,
    );

    const chain = await resolveRouteChain(
      { filePath: "routes/admin/secret.tsx", urlPattern: "admin/secret", segments: ["admin", "secret"] },
      TMP,
    );
    expect(chain.layouts).toHaveLength(1);
    expect(chain.layouts[0]?.middleware).toBeDefined();
    expect(chain.files?.layouts).toEqual(["routes/admin/layout.ts"]);
  });
});

describe("use-server route files: lifecycle exports are never RPC endpoints", () => {
  test("headers / middleware / shouldRevalidate / client hooks are not registered", async () => {
    const { clearActionRegistry, loadServerActionsFromRegistry, resolveAction } =
      await import("../server/action-registry.ts");
    const hash = async (key: string) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    };
    const fn = async () => "called";
    const names = ["headers", "shouldRevalidate", "clientLoader", "clientAction", "handle", "middleware"];
    clearActionRegistry();
    await loadServerActionsFromRegistry([
      {
        relPath: "routes/page.tsx",
        mod: { ...Object.fromEntries(names.map((n) => [n, fn])), publicAction: fn },
      },
    ]);
    for (const n of names) expect(resolveAction(await hash(`routes/page.tsx#${n}`))).toBeNull();
    // A deliberately exported action under a non-reserved name still registers.
    expect(resolveAction(await hash("routes/page.tsx#publicAction"))).not.toBeNull();
    clearActionRegistry();
  });
});

describe("allowExternal redirects are http(s)-only", () => {
  test("redirect() rejects javascript:/data: even with allowExternal", async () => {
    const { redirect } = await import("../server/response.ts");
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>",
      "vbscript:x",
    ]) {
      expect(() => redirect(bad, 302, undefined, { allowExternal: true })).toThrow(/http\(s\)/);
    }
    expect(redirect("https://accounts.example.com/o", 302, undefined, { allowExternal: true }).status).toBe(
      302,
    );
    expect(redirect("//cdn.example.com/x", 302, undefined, { allowExternal: true }).status).toBe(302);
    expect(redirect("/local", 302, undefined, { allowExternal: true }).status).toBe(302);
  });

  test("assignExternal() never follows a non-http(s) target", async () => {
    const { assignExternal } = await import("../client/nav-utils.ts");
    const assigned: string[] = [];
    const prevWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: { href: "https://app.example/", assign: (u: string) => assigned.push(u) },
    };
    const prevError = console.error;
    console.error = () => {};
    try {
      assignExternal("javascript:alert(document.domain)");
      assignExternal(" javascript:alert(1)");
      assignExternal("data:text/html,x");
      assignExternal("https://other.example/ok");
    } finally {
      console.error = prevError;
      (globalThis as { window?: unknown }).window = prevWindow;
    }
    expect(assigned).toEqual(["https://other.example/ok"]);
  });
});

describe("/_image never lets ImageMagick pick a coder", () => {
  test("non-raster sources are rejected before any transform", async () => {
    const { handleImageRequest } = await import("../image/handler.ts");
    const pub = join(TMP, "public");
    await mkdir(pub, { recursive: true });
    for (const name of ["evil.svg", "evil.mvg", "evil.msl", "passwd.txt", "noext"]) {
      await Bun.write(join(pub, name), "push graphic-context\nimage over 0,0 0,0 'text:/etc/passwd'\n");
      const res = await handleImageRequest(
        new Request(`http://x/_image?src=/public/${name}&w=320`),
        pub,
        join(TMP, "img-cache"),
      );
      expect(res?.status).toBe(400);
    }
    // A raster extension passes validation (404 here only because it's absent).
    const ok = await handleImageRequest(
      new Request("http://x/_image?src=/public/missing.png&w=320"),
      pub,
      TMP,
    );
    expect(ok?.status).toBe(404);
  });

  test("the ImageMagick input is pinned to the extension's coder", async () => {
    const { buildArgs } = await import("../image/optimizer.ts");
    const p = { w: 320, q: 80, format: "webp" as const, fit: "cover" as const };
    expect(buildArgs("magick", "/srv/public/a.PNG", p)).toContain("png:/srv/public/a.PNG");
    expect(buildArgs("convert", "/srv/public/b.jpg", p)).toContain("jpeg:/srv/public/b.jpg");
    expect(buildArgs("magick", "/srv/public/a.png", p).some((a) => a.startsWith("file:"))).toBe(false);
    expect(() => buildArgs("magick", "/srv/public/evil.svg", p)).toThrow();
  });

  test("quality snaps to a fixed ladder (bounded cache variants)", async () => {
    const { snapQuality } = await import("../image/handler.ts");
    expect(snapQuality(80)).toBe(80);
    expect(snapQuality(77)).toBe(75);
    expect(snapQuality(78)).toBe(80);
    expect(snapQuality(1)).toBe(25);
    expect(snapQuality(1000)).toBe(100);
    const distinct = new Set(Array.from({ length: 100 }, (_, i) => snapQuality(i + 1)));
    expect(distinct.size).toBeLessThanOrEqual(10);
  });
});

describe("client sourcemaps are opt-in", () => {
  // Everything in build/client/ is publicly served, and a map's sourcesContent
  // carries module-scope route code the minifier dropped from the JS. Static
  // pin (a real runBuild needs a full app fixture — covered by the audit's
  // planted-secret build).
  test("the client Bun.build defaults sourcemap to none", async () => {
    const src = await Bun.file(resolve(import.meta.dir, "../build/bundler.ts")).text();
    const client = src.slice(src.indexOf('target: "browser"'));
    expect(client).toMatch(/sourcemap:\s*config\.sourcemap\s*\?\?\s*"none"/);
  });
});

describe("dev server: DNS-rebinding guard + runtime-gated dev endpoints", () => {
  test("isAllowedDevHost accepts loopback names / IP literals, rejects other names", async () => {
    const { isAllowedDevHost } = await import("../server/dev-host.ts");
    for (const ok of [
      "localhost:3000",
      "app.localhost",
      "127.0.0.1:3000",
      "192.168.1.20:3000",
      "[::1]:3000",
    ]) {
      expect(isAllowedDevHost(ok)).toBe(true);
    }
    for (const bad of ["evil.example:3000", "localhost.evil.example", "127.0.0.1.nip.io", "attacker.test"]) {
      expect(isAllowedDevHost(bad)).toBe(false);
    }
    expect(isAllowedDevHost("dev.example.test", ["dev.example.test"])).toBe(true);
    expect(isAllowedDevHost("a.example.test", [".example.test"])).toBe(true);
    expect(isAllowedDevHost("example.test.evil", [".example.test"])).toBe(false);
  });

  test("dev fetch handler 403s a rebound Host; prod ignores Host", async () => {
    const { buildFetchHandler } = await import("../server/serve.ts");
    const { setRuntimeMode } = await import("../server/env.ts");
    const manifest = { clientEntry: "/x.js", routes: {} };
    const req = (host: string) => new Request("http://127.0.0.1:3000/nope", { headers: { Host: host } });
    setRuntimeMode("dev");
    try {
      const dev = buildFetchHandler({
        appDir: TMP,
        publicDir: join(TMP, "public"),
        manifest,
        routeFiles: [],
      });
      expect((await dev(req("evil.example:3000"))).status).toBe(403);
      expect((await dev(req("localhost:3000"))).status).toBe(404);
    } finally {
      setRuntimeMode("prod");
    }
    const prod = buildFetchHandler({ appDir: TMP, publicDir: join(TMP, "public"), manifest, routeFiles: [] });
    expect((await prod(req("app.example.com"))).status).toBe(404);
  });

  test("NODE_ENV=development alone does not expose /_hmr/module on a prod runtime", async () => {
    const { buildFetchHandler } = await import("../server/serve.ts");
    const prev = Bun.env.NODE_ENV;
    Bun.env.NODE_ENV = "development";
    try {
      const prod = buildFetchHandler({
        appDir: TMP,
        publicDir: join(TMP, "public"),
        manifest: { clientEntry: "/x.js", routes: {} },
        routeFiles: [],
      });
      const res = await prod(new Request("http://localhost/_hmr/module?file=root.tsx"));
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type") ?? "").not.toContain("javascript");
    } finally {
      Bun.env.NODE_ENV = prev;
    }
  });
});
