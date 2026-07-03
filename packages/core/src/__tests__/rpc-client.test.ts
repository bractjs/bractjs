import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "../client/rpc.ts";

// createClient is a fetch proxy — capture what it sends instead of hitting a
// server. Its CSRF-marker behavior must mirror the /api gate's expectations
// (X-BractJS-Action on every mutating call).

type AnyRoutes = { method: string; path: string; input: unknown; output: unknown };

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(response: Response): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response.clone());
  }) as typeof fetch;
  return calls;
}

const okJson = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("createClient", () => {
  test("GET builds the URL from the property chain and sends no CSRF marker", async () => {
    const calls = mockFetch(okJson());
    const client = createClient<AnyRoutes>();
    const out = await client["/api/stats"].GET();
    expect(out).toEqual({ ok: true });
    expect(calls[0].url).toBe("/api/stats");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.headers).toBeUndefined();
    expect(calls[0].init?.body).toBeUndefined();
  });

  test("POST sends X-BractJS-Action, JSON content type, and the body", async () => {
    const calls = mockFetch(okJson());
    const client = createClient<AnyRoutes>();
    await client["/api/posts"].POST({ title: "hi" });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(calls[0].init?.method).toBe("POST");
    expect(headers["X-BractJS-Action"]).toBe("1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init?.body).toBe(JSON.stringify({ title: "hi" }));
  });

  test("DELETE is marked mutating but carries no body", async () => {
    const calls = mockFetch(okJson());
    const client = createClient<AnyRoutes>();
    await client["/api/posts"].DELETE({ id: 1 });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["X-BractJS-Action"]).toBe("1");
    expect(headers["Content-Type"]).toBeUndefined();
    expect(calls[0].init?.body).toBeUndefined();
  });

  test("baseUrl prefixes every request", async () => {
    const calls = mockFetch(okJson());
    const client = createClient<AnyRoutes>("https://api.example.com");
    await client["/api/stats"].GET();
    expect(calls[0].url).toBe("https://api.example.com/api/stats");
  });

  test("non-OK responses throw with status and the server's error message", async () => {
    mockFetch(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createClient<AnyRoutes>();
    try {
      await client["/api/posts"].POST({});
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).toBe("nope");
      expect((err as { status?: number }).status).toBe(403);
    }
  });

  test("non-JSON error bodies fall back to the status text", async () => {
    mockFetch(new Response("<html>gateway error</html>", { status: 502, statusText: "Bad Gateway" }));
    const client = createClient<AnyRoutes>();
    await expect(client["/api/stats"].GET()).rejects.toThrow("Bad Gateway");
  });
});
