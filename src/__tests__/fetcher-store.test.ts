import { test, expect, describe } from "bun:test";
import { fetcherStore, EMPTY_FETCHERS } from "../client/fetcher-store.ts";

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

  test("EMPTY_FETCHERS is a stable empty server snapshot", () => {
    expect(EMPTY_FETCHERS).toEqual([]);
    expect(EMPTY_FETCHERS).toBe(EMPTY_FETCHERS);
  });
});
