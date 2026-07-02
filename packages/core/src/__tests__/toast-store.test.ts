import { afterEach, describe, expect, test } from "bun:test";
import { toast, toastStore } from "../client/toast-store.ts";

afterEach(() => {
  toastStore.clear();
});

describe("toastStore", () => {
  test("add returns an id and the snapshot contains the entry", () => {
    const id = toastStore.add("saved", { type: "success" });
    const snap = toastStore.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id, type: "success", message: "saved" });
  });

  test("adding with an existing id updates in place (loading → success)", () => {
    const id = toastStore.add("working…", { type: "loading" });
    toastStore.add("done", { id, type: "success" });
    const snap = toastStore.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id, type: "success", message: "done" });
  });

  test("dismiss removes only the targeted toast", () => {
    const a = toastStore.add("a");
    toastStore.add("b");
    toastStore.dismiss(a);
    const snap = toastStore.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].message).toBe("b");
  });

  test("clear empties the queue", () => {
    toastStore.add("a");
    toastStore.add("b");
    toastStore.clear();
    expect(toastStore.getSnapshot()).toEqual([]);
  });

  test("subscribe fires on changes and unsubscribe stops it", () => {
    let fired = 0;
    const unsub = toastStore.subscribe(() => {
      fired++;
    });
    toastStore.add("x");
    expect(fired).toBe(1);
    unsub();
    toastStore.add("y");
    expect(fired).toBe(1);
  });

  test("snapshot reference is stable between emits (useSyncExternalStore contract)", () => {
    toastStore.add("x");
    const first = toastStore.getSnapshot();
    expect(toastStore.getSnapshot()).toBe(first);
    toastStore.add("y");
    expect(toastStore.getSnapshot()).not.toBe(first);
  });

  test("auto-dismisses after `duration` ms", async () => {
    toastStore.add("gone soon", { duration: 30 });
    expect(toastStore.getSnapshot()).toHaveLength(1);
    await Bun.sleep(80);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test("loading toasts never auto-dismiss by default", async () => {
    toastStore.add("still going", { type: "loading" });
    await Bun.sleep(60);
    expect(toastStore.getSnapshot()).toHaveLength(1);
  });
});

describe("toast API", () => {
  test("typed helpers stamp the type", () => {
    toast.success("ok");
    toast.error("bad");
    const types = toastStore.getSnapshot().map((t) => t.type);
    expect(types).toEqual(["success", "error"]);
  });

  test("toast.dismiss() with no id clears everything", () => {
    toast("a");
    toast("b");
    toast.dismiss();
    expect(toastStore.getSnapshot()).toEqual([]);
  });

  test("toast.promise transitions loading → success with the resolved value", async () => {
    const p = toast.promise(Promise.resolve(3), {
      loading: "loading…",
      success: (n) => `got ${n}`,
      error: "failed",
    });
    expect(toastStore.getSnapshot()[0]).toMatchObject({ type: "loading", message: "loading…" });
    await p;
    await Bun.sleep(1);
    const snap = toastStore.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ type: "success", message: "got 3" });
  });

  test("toast.promise transitions loading → error and re-rejects to the caller", async () => {
    const p = toast.promise(Promise.reject(new Error("boom")), {
      loading: "loading…",
      success: "ok",
      error: (e) => `failed: ${(e as Error).message}`,
    });
    await expect(p).rejects.toThrow("boom");
    await Bun.sleep(1);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ type: "error", message: "failed: boom" });
  });
});
