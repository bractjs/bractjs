import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AppWatcher, watchApp } from "../dev/watcher.ts";

// fs.watch delivers events asynchronously and the watcher debounces 50ms, so
// each test polls for its expectation instead of sleeping a fixed time.

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

function makeTempAppDir(): string {
  const dir = mkdtempSync(join(import.meta.dir, ".tmp-watcher-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function trackedWatch(dir: string, onChange: Parameters<typeof watchApp>[1]): AppWatcher {
  const watcher = watchApp(dir, onChange);
  cleanups.push(() => watcher.close());
  return watcher;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await Bun.sleep(25);
  }
  return predicate();
}

describe("watchApp", () => {
  test("a burst reports every changed file, not just the last", async () => {
    const dir = makeTempAppDir();
    const bursts: string[][] = [];
    trackedWatch(dir, (_file, info) => {
      bursts.push(info.files);
    });
    // A fresh fs.watch (FSEvents on macOS) can miss writes made before it is
    // armed: wait until one write is seen, then start from a clean slate.
    let armed = false;
    for (let attempt = 0; attempt < 5 && !armed; attempt++) {
      writeFileSync(join(dir, "warmup.ts"), `export const n = ${attempt};`);
      armed = await waitFor(() => bursts.flat().includes("warmup.ts"), 1500);
    }
    expect(armed).toBe(true);
    await Bun.sleep(100);
    bursts.length = 0;

    // Two writes inside one 50ms debounce window: a server module and a route.
    // Reporting only the last one used to drop the restart for x.server.ts.
    // FSEvents can drop events on a busy machine, so re-write the pair (up to
    // 3 times) until one burst reports both — the two writes are back-to-back,
    // so with the fix they share a burst.
    const bothInOneBurst = () => bursts.some((b) => b.includes("page.tsx") && b.includes("x.server.ts"));
    for (let attempt = 0; attempt < 3 && !bothInOneBurst(); attempt++) {
      writeFileSync(join(dir, "x.server.ts"), `export const x = ${attempt};`);
      writeFileSync(join(dir, "page.tsx"), `export default function P() { return ${attempt}; }`);
      await waitFor(bothInOneBurst, 3000);
    }
    expect(bothInOneBurst()).toBe(true);
  });

  test("reports changes and stops reporting after close()", async () => {
    const dir = makeTempAppDir();
    const seen: string[] = [];
    const watcher = trackedWatch(dir, (file) => {
      seen.push(file);
    });

    writeFileSync(join(dir, "a.ts"), "export const a = 1;");
    expect(await waitFor(() => seen.length >= 1)).toBe(true);

    watcher.close();
    const countAtClose = seen.length;

    writeFileSync(join(dir, "b.ts"), "export const b = 2;");
    // Give a closed watcher ample time to (incorrectly) fire.
    await Bun.sleep(300);
    expect(seen.length).toBe(countAtClose);
  });

  test("close() is idempotent and safe mid-debounce", async () => {
    const dir = makeTempAppDir();
    let calls = 0;
    const watcher = trackedWatch(dir, () => {
      calls++;
    });

    // Trigger an event, then close before the 50ms debounce can fire.
    writeFileSync(join(dir, "c.ts"), "export const c = 3;");
    watcher.close();
    watcher.close();

    await Bun.sleep(300);
    expect(calls).toBe(0);
  });

  test("a rejecting async handler is contained (no unhandled rejection)", async () => {
    const dir = makeTempAppDir();
    let invoked = false;
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled++;
    };
    process.on("unhandledRejection", onUnhandled);
    cleanups.push(() => process.off("unhandledRejection", onUnhandled));

    trackedWatch(dir, async () => {
      invoked = true;
      throw new Error("rebuild exploded");
    });

    writeFileSync(join(dir, "d.ts"), "export const d = 4;");
    expect(await waitFor(() => invoked)).toBe(true);
    // Let any rejection propagate if it was going to.
    await Bun.sleep(100);
    expect(unhandled).toBe(0);
  });

  test("ignores files with unwatched extensions", async () => {
    const dir = makeTempAppDir();
    const seen: string[] = [];
    trackedWatch(dir, (file) => {
      seen.push(file);
    });

    writeFileSync(join(dir, "notes.md"), "# not code");
    await Bun.sleep(300);
    expect(seen).toEqual([]);
  });

  test("reports the edited file, not an editor temp file in the same burst", async () => {
    const dir = makeTempAppDir();
    const seen: string[] = [];
    trackedWatch(dir, (file) => {
      seen.push(file);
    });

    // sed -i writes a hidden temp file next to the real one, then renames it.
    writeFileSync(join(dir, "route.tsx"), "export default 1;");
    writeFileSync(join(dir, ".!1234!route.tsx"), "export default 2;");
    expect(await waitFor(() => seen.length > 0)).toBe(true);
    await Bun.sleep(100);
    // (fs.watch may split the writes into two bursts: route.tsx twice is fine.)
    expect(new Set(seen)).toEqual(new Set(["route.tsx"]));
  });
});
