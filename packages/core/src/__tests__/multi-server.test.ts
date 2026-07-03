import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "../server/serve.ts";

// Regression tests for the module-level hook clobbering fixed in the review:
// each createServer() used to overwrite a single activeOnShutdown/activeOnError
// slot, and a global isShuttingDown flag meant stopping one server made every
// later stop() a no-op.

const FIXTURE_APP = resolve(import.meta.dir, "fixtures/app");

function makeServer(port: number, hooks: { onShutdown?: () => void }) {
  return createServer({
    port,
    appDir: FIXTURE_APP,
    manifest: { clientEntry: "/build/client/client.js", routes: {} },
    onShutdown: hooks.onShutdown,
  });
}

describe("multiple createServer() instances", () => {
  test("each server runs its OWN onShutdown when stopped", async () => {
    const stopped: string[] = [];
    const a = makeServer(4381, {
      onShutdown: () => {
        stopped.push("a");
      },
    });
    const b = makeServer(4382, {
      onShutdown: () => {
        stopped.push("b");
      },
    });

    a.stop();
    b.stop();
    // stop() runs the hook asynchronously; give both a beat to complete.
    await Bun.sleep(50);

    expect(stopped.sort()).toEqual(["a", "b"]);
  });

  test("stop() is idempotent per server (second call does not re-run the hook)", async () => {
    let calls = 0;
    const srv = makeServer(4383, {
      onShutdown: () => {
        calls++;
      },
    });

    srv.stop();
    srv.stop();
    await Bun.sleep(50);

    expect(calls).toBe(1);
  });

  test("stopping one server does not disable another's stop()", async () => {
    let secondHookRan = false;
    const first = makeServer(4384, {});
    first.stop();
    await Bun.sleep(20);

    const second = makeServer(4385, {
      onShutdown: () => {
        secondHookRan = true;
      },
    });
    second.stop();
    await Bun.sleep(50);

    expect(secondHookRan).toBe(true);
  });
});
