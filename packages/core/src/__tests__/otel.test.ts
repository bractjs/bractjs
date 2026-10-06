import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { instrument } from "../server/instrumentation.ts";
import { type OtelApi, otel } from "../server/otel.ts";
import { createTestApp } from "../testing-entry.ts";

// A minimal stand-in for @opentelemetry/api with an AsyncLocalStorage context
// manager, recording spans and their parents.
interface FakeSpan {
  name: string;
  kind?: number;
  attributes: Record<string, unknown>;
  parent?: string;
  status?: { code: number; message?: string };
  exceptions: unknown[];
  ended: boolean;
}
type Ctx = { span?: FakeSpan; remote?: string };

function fakeApi() {
  const als = new AsyncLocalStorage<Ctx>();
  const spans: FakeSpan[] = [];
  const api: OtelApi = {
    trace: {
      getTracer: () => ({
        startSpan(name, options, ctx) {
          const parentCtx = (ctx as Ctx | undefined) ?? als.getStore() ?? {};
          const span: FakeSpan = {
            name,
            kind: options?.kind,
            attributes: { ...options?.attributes },
            parent: parentCtx.span?.name ?? parentCtx.remote,
            exceptions: [],
            ended: false,
          };
          spans.push(span);
          return {
            setAttribute: (k: string, v: unknown) => (span.attributes[k] = v),
            setStatus: (s: { code: number; message?: string }) => (span.status = s),
            recordException: (e: unknown) => span.exceptions.push(e),
            updateName: (n: string) => (span.name = n),
            end: () => (span.ended = true),
            _fake: span,
          };
        },
      }),
      setSpan: (ctx, span) => ({ ...(ctx as Ctx), span: (span as unknown as { _fake: FakeSpan })._fake }),
    },
    context: { active: () => als.getStore() ?? {}, with: (ctx, fn) => als.run(ctx as Ctx, fn) },
    propagation: {
      extract: (ctx, carrier) =>
        carrier.traceparent ? { ...(ctx as Ctx), remote: carrier.traceparent } : ctx,
    },
  };
  return { api, spans };
}

const TMP = resolve(import.meta.dir, ".tmp-otel");
const SRC = resolve(import.meta.dir, "..");

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(resolve(TMP, "routes/posts"), { recursive: true });
  await writeFile(
    resolve(TMP, "root.tsx"),
    `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export const middleware = [async (_ctx, next) => next()];
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
  );
  await writeFile(
    resolve(TMP, "routes/posts/[id].tsx"),
    `export async function loader({ params }) {
  if (params.id === "bad") throw new Error("db down");
  return { id: params.id };
}
export default function Post() { return <p>post</p>; }
`,
  );
});
afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("otel()", () => {
  test("a server span per request, continuing traceparent, renamed to its route, with nested route spans", async () => {
    const { api, spans } = fakeApi();
    const off = instrument(otel(api));
    try {
      const app = await createTestApp({ appDir: TMP, serverEntry: false });
      const res = await app.get("/posts/7", {
        headers: { traceparent: "00-remote-parent-01", "User-Agent": "test" },
      });
      expect(res.status).toBe(200);
    } finally {
      off();
    }
    const request = spans.find((s) => s.kind === 1)!;
    expect(request).toMatchObject({
      name: "GET /posts/:id",
      parent: "00-remote-parent-01",
      ended: true,
      attributes: {
        "http.request.method": "GET",
        "url.path": "/posts/7",
        "http.route": "/posts/:id",
        "user_agent.original": "test",
      },
    });
    const loader = spans.find((s) => s.name === "loader routes/posts/[id].tsx")!;
    // Route middleware wraps the loader, so the loader nests under its span.
    expect(loader).toMatchObject({ parent: "middleware root.tsx", kind: 0, ended: true });
    expect(loader.attributes["http.route"]).toBe("/posts/:id");
    const middleware = spans.find((s) => s.name === "middleware root.tsx")!;
    expect(middleware.parent).toBe("GET /posts/:id");
  });

  test("a failing loader records the exception on its span", async () => {
    const { api, spans } = fakeApi();
    const off = instrument(otel(api));
    try {
      const app = await createTestApp({ appDir: TMP, serverEntry: false });
      await app.get("/posts/bad");
    } finally {
      off();
    }
    const loader = spans.find((s) => s.name.startsWith("loader "))!;
    expect(loader.status).toEqual({ code: 2, message: "db down" });
    expect((loader.exceptions[0] as Error).message).toBe("db down");
  });
});
