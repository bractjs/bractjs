import { afterEach, describe, expect, test } from "bun:test";
import { reviveDeferred } from "../client/deferred-revive.ts";
import { appendDeferredScript, encodeDeferred, settleDeferred } from "../server/deferred-wire.ts";
import { Deferred, defer, DEFERRED_WIRE_KEY, isDeferred } from "../shared/deferred.ts";
import { HttpError } from "../shared/errors.ts";

const g = globalThis as { __BRACTJS_DEFERRED__?: unknown; __BRACTJS_RESOLVE__?: unknown };
afterEach(() => {
  delete g.__BRACTJS_DEFERRED__;
  delete g.__BRACTJS_RESOLVE__;
});

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });
}

/** Run an appended `<script>` the way the browser would. */
function runScript(html: string): void {
  const body = /<script[^>]*>([\s\S]*)<\/script>$/.exec(html)?.[1];
  if (!body) throw new Error("no trailing script");
  new Function("self", body)(globalThis);
}

describe("encodeDeferred (document path)", () => {
  test("replaces Deferred fields with id markers; shared values share an id", () => {
    const data = defer({ fast: 1, slow: Promise.resolve(2) });
    const { payload, pending } = encodeDeferred({
      root: null,
      layouts: [],
      route: data,
      matches: [{ data }],
    });
    expect(payload.route).toEqual({ fast: 1, slow: { [DEFERRED_WIRE_KEY]: "d0" } });
    expect((payload.matches as Array<{ data: unknown }>)[0].data).toEqual({
      fast: 1,
      slow: { [DEFERRED_WIRE_KEY]: "d0" },
    });
    expect(pending.map(([id]) => id)).toEqual(["d0"]);
    expect(data.slow).toBeInstanceOf(Deferred); // the original is untouched
  });

  test("no Deferred → nothing pending, payload unchanged", () => {
    const { payload, pending } = encodeDeferred({ route: { a: 1 } });
    expect(payload.route).toEqual({ a: 1 });
    expect(pending).toEqual([]);
  });
});

describe("settleDeferred (/_data path)", () => {
  test("inlines resolved values and sanitized rejections", async () => {
    const payload = await settleDeferred({
      route: defer({
        ok: Promise.resolve({ n: 1 }),
        http: Promise.reject(new HttpError(404, "missing")),
        boom: Promise.reject(new Error("db password is hunter2")),
      }),
    });
    expect(payload.route).toEqual({
      ok: { [DEFERRED_WIRE_KEY]: { ok: true, value: { n: 1 } } },
      http: { [DEFERRED_WIRE_KEY]: { ok: false, error: { message: "missing", status: 404 } } },
      // Outside development an arbitrary error's message never reaches the client.
      boom: { [DEFERRED_WIRE_KEY]: { ok: false, error: { message: "Internal Server Error" } } },
    });
  });
});

describe("appendDeferredScript", () => {
  test("passes the stream through, then appends one nonce'd script", async () => {
    const d = new Deferred(Promise.resolve("</script><b>x"));
    const html = await new Response(
      appendDeferredScript(streamOf("<html>", "</html>"), [["d0", d]], "abc"),
    ).text();
    expect(html.startsWith('<html></html><script nonce="abc">')).toBe(true);
    // Values are embedded with the XSS-safe serializer.
    expect(html).not.toContain("</script><b>");
  });

  test("without pending values the stream is returned as-is", () => {
    const s = streamOf("x");
    expect(appendDeferredScript(s, [])).toBe(s);
  });
});

describe("round trip: server encode → streamed script → client revive", () => {
  test("script before revive (normal order: module runs after the document)", async () => {
    const { payload, pending } = encodeDeferred({
      route: defer({ slow: Promise.resolve({ items: [1, 2] }) }),
    });
    runScript(await new Response(appendDeferredScript(streamOf(""), pending)).text());
    const revived = reviveDeferred(
      JSON.parse(JSON.stringify(payload)) as { route: { slow: Deferred<unknown> } },
    );
    expect(isDeferred(revived.route.slow)).toBe(true);
    const p = revived.route.slow.promise as Promise<unknown> & { status?: string };
    expect(p.status).toBe("fulfilled"); // hydrates without suspending
    expect(await p).toEqual({ items: [1, 2] });
  });

  test("revive before script (value arrives later)", async () => {
    const { payload, pending } = encodeDeferred({ route: defer({ slow: Promise.resolve("late") }) });
    const revived = reviveDeferred(
      JSON.parse(JSON.stringify(payload)) as { route: { slow: Deferred<unknown> } },
    );
    runScript(await new Response(appendDeferredScript(streamOf(""), pending)).text());
    expect(await revived.route.slow.promise).toBe("late");
  });

  test("a rejection revives as a rejected promise carrying the HttpError", async () => {
    const payload = await settleDeferred({ route: defer({ x: Promise.reject(new HttpError(404, "gone")) }) });
    const revived = reviveDeferred(JSON.parse(JSON.stringify(payload)) as { route: unknown });
    const err = (await (revived.route as { x: Deferred<unknown> }).x.promise.catch((e) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toBe("gone");
    expect(err.status).toBe(404);
  });

  test("reviving is idempotent", () => {
    const once = reviveDeferred({ route: { x: { [DEFERRED_WIRE_KEY]: { ok: true, value: 1 } } } });
    expect(reviveDeferred(once)).toEqual(once);
  });
});
