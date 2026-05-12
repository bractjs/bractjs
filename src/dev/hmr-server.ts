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
