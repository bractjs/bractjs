import { afterEach, describe, expect, test } from "bun:test";
import { CSP_NONCE_KEY, csp, getCspNonce } from "../server/csp.ts";
import { setDevHmrPort, setRuntimeMode } from "../server/env.ts";
import { type MiddlewareContext, MiddlewarePipeline } from "../server/middleware.ts";
import { renderRoute } from "../server/render.ts";

async function runCsp(
  mw: ReturnType<typeof csp>,
  handler: (ctx: MiddlewareContext) => Promise<Response>,
): Promise<{ res: Response; ctx: MiddlewareContext }> {
  const ctx: MiddlewareContext = { request: new Request("http://x/"), params: {}, context: {} };
  const pipeline = new MiddlewarePipeline();
  pipeline.use(mw);
  const res = await pipeline.run(ctx, () => handler(ctx));
  return { res, ctx };
}

describe("csp middleware", () => {
  test("sets Content-Security-Policy header with a script-src nonce", async () => {
    const { res, ctx } = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
    const policy = res.headers.get("Content-Security-Policy");
    expect(policy).toBeTruthy();
    const nonce = getCspNonce(ctx.context);
    expect(nonce).toBeTruthy();
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(policy).toContain("default-src 'self'");
  });

  test("stashes the nonce on the context under CSP_NONCE_KEY", async () => {
    const { ctx } = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
    expect(typeof ctx.context[CSP_NONCE_KEY]).toBe("string");
  });

  test("generates a fresh nonce per request", async () => {
    const a = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
    const b = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
    expect(getCspNonce(a.ctx.context)).not.toBe(getCspNonce(b.ctx.context));
  });

  test("custom directives override/extend the defaults", async () => {
    const { res } = await runCsp(
      csp({ directives: { "img-src": "'self' https://cdn.example", "frame-ancestors": "'none'" } }),
      () => Promise.resolve(new Response("ok")),
    );
    const policy = res.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("img-src 'self' https://cdn.example");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  describe("dev runtime connect-src", () => {
    afterEach(() => {
      setRuntimeMode("prod");
      setDevHmrPort(0);
    });

    test("appends the HMR websocket to connect-src under bractjs dev", async () => {
      setRuntimeMode("dev");
      setDevHmrPort(3999);
      const { res } = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
      expect(res.headers.get("Content-Security-Policy")).toContain("connect-src 'self' ws://localhost:3999");
    });

    test("appends over a user-supplied connect-src too", async () => {
      setRuntimeMode("dev");
      setDevHmrPort(3999);
      const { res } = await runCsp(csp({ directives: { "connect-src": "'self' https://api.example" } }), () =>
        Promise.resolve(new Response("ok")),
      );
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "connect-src 'self' https://api.example ws://localhost:3999",
      );
    });

    test("does not touch connect-src outside dev", async () => {
      const { res } = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
      const policy = res.headers.get("Content-Security-Policy")!;
      expect(policy).toContain("connect-src 'self'");
      expect(policy).not.toContain("ws://localhost");
    });
  });

  test("a null directive value removes that directive", async () => {
    const { res } = await runCsp(csp({ directives: { "object-src": null } }), () =>
      Promise.resolve(new Response("ok")),
    );
    expect(res.headers.get("Content-Security-Policy")).not.toContain("object-src");
  });

  test("default style-src allows 'unsafe-inline'; strict drops it", async () => {
    const def = await runCsp(csp(), () => Promise.resolve(new Response("ok")));
    expect(def.res.headers.get("Content-Security-Policy")).toContain("style-src 'self' 'unsafe-inline'");

    const strict = await runCsp(csp({ strict: true }), () => Promise.resolve(new Response("ok")));
    const policy = strict.res.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("'unsafe-inline'");
  });

  test("reportOnly emits the report-only header instead", async () => {
    const { res } = await runCsp(csp({ reportOnly: true }), () => Promise.resolve(new Response("ok")));
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });
});

describe("csp + render", () => {
  test("renderRoute stamps the nonce onto the inline bootstrap script", async () => {
    const res = await renderRoute({
      shell: null,
      loaderData: {},
      actionData: null,
      params: {},
      pathname: "/",
      manifest: { clientEntry: "/build/client/client.js", routes: {} },
      meta: [],
      nonce: "test-nonce-123",
    });
    const html = await res.text();
    // The inline bootstrap script React emits should carry our nonce.
    expect(html).toMatch(/<script[^>]*nonce="test-nonce-123"/);
  });
});
