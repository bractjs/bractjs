import type { ServerWebSocket } from "bun";

// ── HMR Server ─────────────────────────────────────────────────────────────

interface HmrMessage {
  type: string;
  file?: string;
  duration?: number;
  [key: string]: unknown;
}

const clients = new Set<ServerWebSocket<unknown>>();

export function createHmrServer(port = 3001): {
  broadcast(msg: HmrMessage): void;
  stop(): void;
} {
  const server = Bun.serve({
    port,
    fetch(req, srv) {
      // SECURITY(medium): reject WebSocket upgrades that don't come from a
      // loopback Origin. Without this, any website the developer visits could
      // open a WS to ws://localhost:<port> and receive file paths from HMR
      // broadcasts (a passive leak of project structure). Same-origin /
      // missing Origin (curl, native ws clients) are allowed for dev DX.
      const origin = req.headers.get("Origin");
      if (origin) {
        try {
          const host = new URL(origin).hostname;
          if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]" && host !== "::1") {
            return new Response("Forbidden", { status: 403 });
          }
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
      }
      if (srv.upgrade(req)) return undefined;
      return new Response("HMR WebSocket endpoint", { status: 426 });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {
        // clients don't send messages
      },
    },
  });

  console.log(`HMR server on ws://localhost:${port}`);

  return {
    broadcast(msg: HmrMessage) {
      const payload = JSON.stringify(msg);
      for (const ws of clients) {
        ws.send(payload);
      }
    },
    stop() {
      clients.clear();
      server.stop(true);
    },
  };
}
