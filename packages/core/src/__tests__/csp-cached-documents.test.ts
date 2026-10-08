// csp() nonces on documents served from a cache: prerendered pages, ISR pages
// and the SPA shell are rendered with a per-render placeholder nonce and get each
// request's own nonce when served — so 'strict-dynamic' pages hydrate, and no
// two visitors share a nonce.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runPrerender } from "../build/prerender.ts";
import { privateWhenNonced } from "../server/cache.ts";
import {
  applyCspNonce,
  createNoncePlaceholder,
  CSP_NONCE_KEY,
  csp,
  readNonceStamp,
  stampNoncePlaceholder,
} from "../server/csp.ts";
import { cachedRenderPlaceholder, createIsr, markCachedRender, PRERENDER_HEADER } from "../server/isr.ts";
import { pipeline } from "../server/middleware.ts";
import { createServer } from "../server/serve.ts";

const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");
const TMP_BUILD = resolve(import.meta.dir, `.tmp-csp-cached-${Date.now()}`);
const MANIFEST = { clientEntry: "/build/client/client.js", routes: {} };

/** The nonce in the CSP header and every nonce="…" attribute in the body. */
async function nonces(res: Response): Promise<{ header: string | null; attrs: string[]; html: string }> {
  const header = /'nonce-([^']+)'/.exec(res.headers.get("Content-Security-Policy") ?? "")?.[1] ?? null;
  const html = await res.text();
  const attrs = [...html.matchAll(/ nonce="([^"]*)"/g)].map((m) => m[1]);
  return { header, attrs, html };
}

describe("per-render nonce placeholders", () => {
  test("each render gets a fresh, unguessable token", () => {
    const a = createNoncePlaceholder();
    const b = createNoncePlaceholder();
    expect(a).toMatch(/^__BRACTJS_NONCE_[0-9a-f]{32}__$/);
    expect(a).not.toBe(b);
  });

  test("applyCspNonce swaps only THIS render's token", () => {
    const ph = createNoncePlaceholder();
    const doc = `<script nonce="${ph}">x</script><p>${ph}</p>`;
    expect(applyCspNonce(doc, ph, "abc")).toBe(`<script nonce="abc">x</script><p>abc</p>`);
    expect(applyCspNonce(doc, ph, undefined)).toBe("<script>x</script><p></p>");
    expect(applyCspNonce('<script nonce="old">', ph, "abc")).toBe('<script nonce="old">');
    expect(applyCspNonce(doc, undefined, "abc")).toBe(doc);
  });

  test("SECURITY: injected content can't plant a token that gets a real nonce", () => {
    // A stored-XSS payload written before the render can't know its token;
    // a look-alike (or the old fixed placeholder) is left alone.
    const ph = createNoncePlaceholder();
    const planted = `<script nonce="${createNoncePlaceholder()}">evil()</script><script nonce="__BRACTJS_NONCE__">evil()</script>`;
    const out = applyCspNonce(`<script nonce="${ph}"></script>${planted}`, ph, "REAL");
    expect(out).toBe(`<script nonce="REAL"></script>${planted}`);
  });

  test("a stamp is read only at the very start of the file", () => {
    const ph = createNoncePlaceholder();
    expect(readNonceStamp(stampNoncePlaceholder("<!DOCTYPE html><p>", ph))).toEqual({
      body: "<!DOCTYPE html><p>",
      placeholder: ph,
    });
    const injected = `<p></p><!--bractjs-nonce:${ph}-->`;
    expect(readNonceStamp(injected)).toEqual({ body: injected });
  });
});

describe("render-for-cache marker", () => {
  test("is per Request object, not a header anyone can send", () => {
    const spoofed = new Request("http://x/", { headers: { [PRERENDER_HEADER]: "1" } });
    expect(cachedRenderPlaceholder(spoofed)).toBeUndefined();
    const ph = createNoncePlaceholder();
    expect(cachedRenderPlaceholder(markCachedRender(new Request("http://x/"), ph))).toBe(ph);
  });
});

describe("ISR serve() puts the request's nonce in", () => {
  test("html and data", async () => {
    const ph = createNoncePlaceholder();
    const files: Record<string, string> = {
      "_isr.json": JSON.stringify({ generatedAt: Date.now(), routes: { "/p": 60 } }),
      "p/index.html": stampNoncePlaceholder(`<script nonce="${ph}"></script>`, ph),
      "p/_data.json": `{"n":"${ph}"}`,
    };
    const isr = createIsr({
      load: async (rel) => files[rel] ?? null,
      render: async () => {
        throw new Error("not due");
      },
    });
    expect(await (await isr.serve("/p", "html", "n1"))!.text()).toBe('<script nonce="n1"></script>');
    expect(await (await isr.serve("/p", "data", "n1"))!.text()).toBe('{"n":"n1"}');
    expect(await (await isr.serve("/p", "html"))!.text()).toBe("<script></script>");
  });
});

describe("privateWhenNonced", () => {
  const html = (cc: string) =>
    new Response("<p>", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cc } });
  test("a nonced public HTML response becomes private", () => {
    const res = privateWhenNonced(html("public, max-age=0, s-maxage=60"), { [CSP_NONCE_KEY]: "n" });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
  });
  test("a plain max-age counts too; no-store / private are kept; CDN headers are dropped", () => {
    const n = { [CSP_NONCE_KEY]: "n" };
    expect(privateWhenNonced(html("max-age=300"), n).headers.get("Cache-Control")).toBe(
      "private, max-age=0, must-revalidate",
    );
    expect(privateWhenNonced(html("public, no-store"), n).headers.get("Cache-Control")).toBe(
      "public, no-store",
    );
    const cdn = html("private");
    cdn.headers.set("CDN-Cache-Control", "max-age=600");
    cdn.headers.set("Surrogate-Control", "max-age=600");
    const out = privateWhenNonced(cdn, n);
    expect(out.headers.get("Cache-Control")).toBe("private");
    expect(out.headers.has("CDN-Cache-Control")).toBe(false);
    expect(out.headers.has("Surrogate-Control")).toBe(false);
  });

  test("untouched without a nonce, for non-HTML, or when already private", () => {
    expect(privateWhenNonced(html("public, max-age=60"), {}).headers.get("Cache-Control")).toBe(
      "public, max-age=60",
    );
    const json = new Response("{}", {
      headers: { "Content-Type": "application/json", "Cache-Control": "public" },
    });
    expect(privateWhenNonced(json, { [CSP_NONCE_KEY]: "n" }).headers.get("Cache-Control")).toBe("public");
    expect(
      privateWhenNonced(html("private, max-age=60"), { [CSP_NONCE_KEY]: "n" }).headers.get("Cache-Control"),
    ).toBe("private, max-age=60");
    // `no-cache` still lets a shared cache STORE the page (it only forces revalidation).
    expect(privateWhenNonced(html("no-cache"), { [CSP_NONCE_KEY]: "n" }).headers.get("Cache-Control")).toBe(
      "private, max-age=0, must-revalidate",
    );
  });
});

// ── Real servers ────────────────────────────────────────────────────────────

describe("prerendered pages + csp()", () => {
  const PORT = 3973;
  const BASE = `http://localhost:${PORT}`;
  let handle: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // Built WITHOUT csp() registered, as `bractjs build` does.
    pipeline.clear();
    await runPrerender({ prerender: ["/"], appDir: FIXTURE_APP, buildDir: TMP_BUILD, manifest: MANIFEST });
    pipeline.use(csp());
    handle = createServer({ port: PORT, appDir: FIXTURE_APP, buildDir: TMP_BUILD, manifest: MANIFEST });
  });

  afterAll(async () => {
    handle.stop();
    pipeline.clear();
    await rm(TMP_BUILD, { recursive: true, force: true });
  });

  test("the build output is stamped with its render's placeholder, used for every nonce", async () => {
    const raw = await Bun.file(join(TMP_BUILD, "client", "_prerender", "index.html")).text();
    const { body, placeholder } = readNonceStamp(raw);
    expect(placeholder).toMatch(/^__BRACTJS_NONCE_[0-9a-f]{32}__$/);
    const attrs = [...body.matchAll(/ nonce="([^"]*)"/g)].map((m) => m[1]);
    expect(attrs.length).toBeGreaterThan(0);
    expect(new Set(attrs)).toEqual(new Set([placeholder!]));
  });

  test("each request gets its own nonce, matching its header; not shared-cacheable", async () => {
    const a = await nonces(await fetch(`${BASE}/`));
    const b = await nonces(await fetch(`${BASE}/`));
    for (const r of [a, b]) {
      expect(r.header).not.toBeNull();
      expect(r.attrs.length).toBeGreaterThan(0);
      expect(new Set(r.attrs)).toEqual(new Set([r.header!]));
      expect(r.html).not.toContain("__BRACTJS_NONCE_");
      expect(r.html).not.toContain("bractjs-nonce:");
    }
    expect(a.header).not.toBe(b.header);
    const res = await fetch(`${BASE}/`);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
  });

  test("a render FOR the cache (ISR regeneration) keeps the placeholder even with csp() on", async () => {
    const { buildFetchHandler } = await import("../server/serve.ts");
    const handler = buildFetchHandler({ appDir: FIXTURE_APP, buildDir: TMP_BUILD, manifest: MANIFEST });
    const ph = createNoncePlaceholder();
    const html = await (await handler(markCachedRender(new Request(`${BASE}/?regen=1`), ph))).text();
    const attrs = [...html.matchAll(/ nonce="([^"]*)"/g)].map((m) => m[1]);
    expect(attrs.length).toBeGreaterThan(0);
    expect(new Set(attrs)).toEqual(new Set([ph]));
  });

  test("a client sending X-BractJS-Prerender still gets a real nonce (dynamic SSR)", async () => {
    const r = await nonces(await fetch(`${BASE}/?dynamic=1`, { headers: { [PRERENDER_HEADER]: "1" } }));
    expect(r.attrs.length).toBeGreaterThan(0);
    expect(new Set(r.attrs)).toEqual(new Set([r.header!]));
  });

  test("without csp() the prerendered page has no nonce attributes and stays public", async () => {
    pipeline.clear();
    try {
      const res = await fetch(`${BASE}/`);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
      const html = await res.text();
      expect(html).not.toContain("nonce=");
      expect(html).not.toContain("__BRACTJS_NONCE_");
    } finally {
      pipeline.use(csp());
    }
  });
});

describe("SPA shell + csp()", () => {
  const PORT = 3974;
  const BASE = `http://localhost:${PORT}`;
  let handle: ReturnType<typeof createServer>;

  beforeAll(() => {
    pipeline.clear();
    pipeline.use(csp());
    handle = createServer({ port: PORT, appDir: FIXTURE_APP, ssr: false, manifest: MANIFEST });
  });

  afterAll(() => {
    handle.stop();
    pipeline.clear();
  });

  test("the shell's scripts carry this request's nonce", async () => {
    const a = await nonces(await fetch(`${BASE}/`));
    const b = await nonces(await fetch(`${BASE}/`));
    expect(a.attrs.length).toBeGreaterThan(0);
    expect(new Set(a.attrs)).toEqual(new Set([a.header!]));
    expect(a.header).not.toBe(b.header);
    expect(a.html).not.toContain("__BRACTJS_NONCE_");
  });
});
