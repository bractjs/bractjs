import { describe, expect, test } from "bun:test";
import { EMPTY_FETCHERS, fetcherStore } from "../client/fetcher-store.ts";
import { fetcherLoad, fetcherSubmit } from "../client/hooks/useFetcher.ts";

// The store is a module-level singleton — use unique keys per test so cases
// stay independent.

describe("fetcherStore", () => {
  test("update creates an entry with idle defaults merged", () => {
    fetcherStore.update("t1", { state: "submitting", formMethod: "POST" });
    const entry = fetcherStore.get("t1");
    expect(entry).toEqual({
      key: "t1",
      state: "submitting",
      data: undefined,
      formMethod: "POST",
    });
    fetcherStore.remove("t1");
  });

  test("partial updates preserve other fields", () => {
    fetcherStore.update("t2", { state: "submitting", formMethod: "DELETE" });
    fetcherStore.update("t2", { data: { ok: true } });
    const entry = fetcherStore.get("t2")!;
    expect(entry.state).toBe("submitting");
    expect(entry.formMethod).toBe("DELETE");
    expect(entry.data).toEqual({ ok: true });
    fetcherStore.remove("t2");
  });

  test("subscribe fires on update and remove; unsubscribe stops it", () => {
    let calls = 0;
    const unsub = fetcherStore.subscribe(() => calls++);
    fetcherStore.update("t3", { state: "loading" });
    expect(calls).toBe(1);
    fetcherStore.remove("t3");
    expect(calls).toBe(2);
    unsub();
    fetcherStore.update("t3b", { state: "loading" });
    expect(calls).toBe(2);
    fetcherStore.remove("t3b");
  });

  test("removing a missing key does not notify", () => {
    let calls = 0;
    const unsub = fetcherStore.subscribe(() => calls++);
    fetcherStore.remove("never-existed");
    expect(calls).toBe(0);
    unsub();
  });

  test("snapshot is referentially stable between updates (useSyncExternalStore contract)", () => {
    fetcherStore.update("t4", { state: "idle" });
    const a = fetcherStore.getSnapshot();
    const b = fetcherStore.getSnapshot();
    expect(a).toBe(b);
    fetcherStore.update("t4", { state: "loading" });
    const c = fetcherStore.getSnapshot();
    expect(c).not.toBe(a);
    expect(c.find((e) => e.key === "t4")?.state).toBe("loading");
    fetcherStore.remove("t4");
  });

  test("patch updates a live entry but never resurrects a removed one", () => {
    fetcherStore.update("t5", { state: "loading" });
    fetcherStore.patch("t5", { state: "idle", data: 1 });
    expect(fetcherStore.get("t5")).toMatchObject({ state: "idle", data: 1 });
    fetcherStore.remove("t5");
    fetcherStore.patch("t5", { state: "idle" });
    expect(fetcherStore.get("t5")).toBeUndefined();
  });

  test("an in-flight submit/load whose fetcher unmounted leaves no ghost entry", async () => {
    const g = globalThis as { fetch: typeof fetch; window?: unknown };
    const prevFetch = g.fetch;
    const prevWindow = g.window;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    g.fetch = (async () => {
      await gate;
      return Response.json({ route: { ok: true }, params: {}, search: {} });
    }) as unknown as typeof fetch;
    g.window = { location: { origin: "http://x", href: "http://x/" } };
    try {
      for (const start of [
        () =>
          fetcherSubmit("ghost", {
            url: "/x",
            method: "POST",
            body: new FormData(),
            formData: new FormData(),
          }),
        () => fetcherLoad("ghost", "/x"),
      ]) {
        const done = start();
        expect(fetcherStore.get("ghost")).toBeDefined();
        fetcherStore.remove("ghost"); // the unkeyed fetcher's component unmounted mid-flight
        release();
        await done;
        expect(fetcherStore.get("ghost")).toBeUndefined();
        expect(fetcherStore.getSnapshot().some((e) => e.key === "ghost")).toBe(false);
      }
    } finally {
      g.fetch = prevFetch;
      g.window = prevWindow;
    }
  });

  test("EMPTY_FETCHERS is a stable empty server snapshot", () => {
    expect(EMPTY_FETCHERS).toEqual([]);
    expect(EMPTY_FETCHERS).toBe(EMPTY_FETCHERS);
  });
});
