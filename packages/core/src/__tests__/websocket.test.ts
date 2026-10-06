import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeAdapter } from "../adapters/node.ts";
import { BunAdapter } from "../server/adapter.ts";
import { withCompression } from "../server/compression.ts";
import { buildFetchHandler } from "../server/serve.ts";
import { clearWebSocketEndpoints, registerUpgrader, websocket } from "../server/websocket.ts";

const TMP = resolve(import.meta.dir, ".tmp-websocket");
const SRC = resolve(import.meta.dir, "..");
const MANIFEST = { clientEntry: "/c.js", routes: {} };

beforeAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(resolve(TMP, "routes"), { recursive: true });
  await writeFile(
    resolve(TMP, "root.tsx"),
    `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
  );
});
afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});
afterEach(() => clearWebSocketEndpoints());

const handshake = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${path}`, {
    headers: { Upgrade: "websocket", Connection: "Upgrade", ...headers },
  });

describe("websocket() dispatch", () => {
  test("runs middleware and upgrade(), then hands the adapter the data", async () => {
    const seen: string[] = [];
    websocket(
      "/ws/rooms/:room",
      { upgrade: ({ params, context }) => ({ room: params.room, user: context.user }) },
      {
        middleware: [
          async ({ context }, next) => {
            seen.push("mw");
            context.user = "ada";
            return next();
          },
        ],
      },
    );
    const handler = buildFetchHandler({ appDir: TMP, manifest: MANIFEST });
    const req = handshake("/ws/rooms/lobby", { Origin: "http://localhost:3000" });
    let upgradedWith: unknown;
    registerUpgrader(req, ({ data }) => {
      upgradedWith = data;
      return true;
    });
    const res = await handler(req);
    expect(res.headers.get("X-BractJS-WebSocket")).toBe("upgraded");
    expect(seen).toEqual(["mw"]);
    expect(upgradedWith).toEqual({ room: "lobby", user: "ada" });
  });

  test("a cross-origin handshake is refused before anything runs", async () => {
    let upgraded = false;
    websocket("/ws", { upgrade: () => (upgraded = true) });
    const handler = buildFetchHandler({ appDir: TMP, manifest: MANIFEST });
    const req = handshake("/ws", { Origin: "https://evil.example" });
    registerUpgrader(req, () => true);
    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(upgraded).toBe(false);
  });

  test("upgrade() can refuse with a Response", async () => {
    websocket("/ws", { upgrade: () => new Response("Unauthorized", { status: 401 }) });
    const handler = buildFetchHandler({ appDir: TMP, manifest: MANIFEST });
    const req = handshake("/ws");
    let called = false;
    registerUpgrader(req, () => (called = true));
    expect((await handler(req)).status).toBe(401);
    expect(called).toBe(false);
  });

  test("without an upgrading adapter (Node.js), the handshake gets a 501", async () => {
    websocket("/ws", {});
    const handler = buildFetchHandler({ appDir: TMP, manifest: MANIFEST });
    expect((await handler(handshake("/ws"))).status).toBe(501);
  });

  test("a Node.js server refuses to start with websocket endpoints", () => {
    websocket("/ws", {});
    const adapter = new NodeAdapter();
    adapter.setHandler(async () => new Response());
    expect(() => adapter.listen(0)).toThrow("need a Bun or Deno server");
  });
});

describe("websocket() on a real Bun server", () => {
  test("open, message, close — with the data from upgrade()", async () => {
    const events: string[] = [];
    const closed = Promise.withResolvers<void>();
    websocket<{ name: string }>("/ws/echo", {
      upgrade: ({ request }) => ({ name: new URL(request.url).searchParams.get("name") ?? "anon" }),
      open(ws) {
        events.push("open");
        ws.send(`hello ${ws.data.name}`);
      },
      message(ws, message) {
        events.push(`message ${String(message)}`);
        ws.send(`echo: ${String(message)}`);
      },
      close(_ws, code) {
        events.push(`close ${code}`);
        closed.resolve();
      },
    });
    const adapter = new BunAdapter();
    // As createServer() wires it: compression around the app handler.
    adapter.setHandler(withCompression(buildFetchHandler({ appDir: TMP, manifest: MANIFEST })));
    adapter.listen(0);
    try {
      const client = new WebSocket(`ws://localhost:${adapter.port}/ws/echo?name=ada`);
      const received: string[] = [];
      const gotTwo = Promise.withResolvers<void>();
      client.onmessage = (e) => {
        received.push(String(e.data));
        if (received.length === 2) gotTwo.resolve();
      };
      client.onopen = () => client.send("ping");
      await gotTwo.promise;
      expect(received).toEqual(["hello ada", "echo: ping"]);
      client.close(1000);
      await closed.promise;
      expect(events).toEqual(["open", "message ping", "close 1000"]);
    } finally {
      adapter.stop();
    }
  });

  test("a cross-origin browser handshake fails", async () => {
    websocket("/ws/echo", {});
    const adapter = new BunAdapter();
    adapter.setHandler(buildFetchHandler({ appDir: TMP, manifest: MANIFEST }));
    adapter.listen(0);
    try {
      const client = new WebSocket(`ws://localhost:${adapter.port}/ws/echo`, {
        headers: { Origin: "https://evil.example" },
      } as unknown as string[]);
      const outcome = await new Promise<string>((done) => {
        client.onopen = () => done("open");
        client.onerror = () => done("error");
      });
      expect(outcome).toBe("error");
    } finally {
      adapter.stop();
    }
  });
});
