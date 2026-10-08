// Regressions found by the review of the 2026-10 scan-backlog fixes.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { redirectOf } from "../client/client-data.ts";
import { generateRouteTypes } from "../codegen/route-codegen.ts";
import { serializeRebuilds } from "../dev/rebuilder.ts";
import type { LayoutChain } from "../server/layout.ts";
import { runLoaders } from "../server/loader.ts";
import { wrapSocket } from "../server/websocket.ts";
import type { LoaderArgs } from "../shared/route-types.ts";

const TMP = resolve(import.meta.dir, `.tmp-backlog-regressions-${Date.now()}`);
afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

test("serializeRebuilds: a run that throws SYNCHRONOUSLY doesn't block later batches", async () => {
  const ran: string[] = [];
  const prev = console.error;
  console.error = () => {};
  try {
    const schedule = serializeRebuilds<string>(
      ((b: string) => {
        if (b === "boom") throw new Error("sync throw");
        ran.push(b);
        return Promise.resolve();
      }) as (b: string) => Promise<void>,
      (_a, b) => b,
    );
    await schedule("boom");
    await schedule("after");
  } finally {
    console.error = prev;
  }
  expect(ran).toEqual(["after"]);
});

test("generated route builders encode params (they are decoded on the way in)", async () => {
  const app = join(TMP, "codegen-app");
  await mkdir(join(app, "routes", "posts"), { recursive: true });
  await writeFile(join(app, "routes", "posts", "[slug].tsx"), "export default () => null;");
  const out = await generateRouteTypes(app);
  expect(out).toContain("${encodeURIComponent(String(params.slug))}");
});

describe("returned redirects need a Location", () => {
  const stubArgs = { request: new Request("http://x/"), params: {}, context: {} } as unknown as LoaderArgs;

  test("a returned 304 (no Location) stays slot data; a returned 302 rejects", async () => {
    const notModified = new Response(null, { status: 304 });
    const chain: LayoutChain = { root: {}, layouts: [], route: { loader: async () => notModified } };
    expect((await runLoaders(chain, stubArgs)).route).toBe(notModified);
    const to = new Response(null, { status: 302, headers: { Location: "/x" } });
    await expect(
      runLoaders({ root: {}, layouts: [], route: { loader: async () => to } }, stubArgs),
    ).rejects.toBe(to);
  });

  test("redirectOf (client)", () => {
    expect(redirectOf(new Response(null, { status: 302, headers: { Location: "/a" } }))).not.toBeNull();
    expect(redirectOf(new Response(null, { status: 304 }))).toBeNull();
    expect(redirectOf({ status: 302 })).toBeNull();
  });
});

test("wrapSocket.send() is false on a CLOSING/CLOSED standard socket (which discards silently)", () => {
  let sent = 0;
  const raw = (readyState: number) => ({
    readyState,
    send: () => {
      sent++;
    },
    close: () => {},
  });
  expect(wrapSocket(raw(1), null).send("x")).toBe(true);
  expect(wrapSocket(raw(2), null).send("x")).toBe(false);
  expect(wrapSocket(raw(3), null).send("x")).toBe(false);
  expect(sent).toBe(1);
  // A caller bug (unsupported message type) still surfaces.
  const bad = {
    send: () => {
      throw new TypeError("bad message");
    },
    close: () => {},
  };
  expect(() => wrapSocket(bad, null).send("x")).toThrow(TypeError);
});

test("/_stream: a client that leaves while the action is still running closes the iterator", async () => {
  const { clearActionRegistry, loadServerActionsFromRegistry } = await import("../server/action-registry.ts");
  const { handleStreamRequest } = await import("../server/stream-handler.ts");
  let closed = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  // An iterable whose resource is acquired in the action body (a subscription).
  async function subscribe() {
    await gate;
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: false, value: 1 }),
          return: async () => {
            closed = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
  }
  clearActionRegistry();
  await loadServerActionsFromRegistry([{ relPath: "lib/sub.server.ts", mod: { subscribe } }]);
  const raw = new TextEncoder().encode("lib/sub.server.ts#subscribe");
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), (b) =>
    b.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 16);
  const res = await handleStreamRequest(
    new Request(`http://localhost/_stream?id=${id}`, { headers: { "X-BractJS-Action": "1" } }),
  );
  await res!.body!.cancel(); // the client leaves before the action resolved
  release();
  await Bun.sleep(10);
  expect(closed).toBe(true);
});
