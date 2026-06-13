import { test, expect, describe, afterEach } from "bun:test";
import { defineActions } from "../shared/define-actions.ts";
import type { ActionArgs } from "../shared/route-types.ts";

function argsWith(intent?: string, extra: Record<string, string> = {}): ActionArgs {
  const fd = new FormData();
  if (intent !== undefined) fd.set("intent", intent);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return {
    request: new Request("http://localhost/"),
    params: {},
    context: {},
    search: {},
    formData: fd,
  };
}

const ORIGINAL_ENV = Bun.env.NODE_ENV;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete Bun.env.NODE_ENV;
  else Bun.env.NODE_ENV = ORIGINAL_ENV;
});

describe("defineActions", () => {
  test("dispatches to the matching handler with full args", async () => {
    let seen: ActionArgs | null = null;
    const action = defineActions({
      add: (args) => { seen = args; return { ok: true, who: "add" }; },
      remove: () => ({ ok: true, who: "remove" }),
    });
    const result = await action(argsWith("add", { title: "x" }));
    expect(result).toEqual({ ok: true, who: "add" });
    expect(seen!.formData.get("title")).toBe("x");
  });

  test("unknown intent → 400 listing known intents in dev", async () => {
    Bun.env.NODE_ENV = "development";
    const action = defineActions({ add: () => ({}), remove: () => ({}) });
    const res = await action(argsWith("nope"));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    const body = await (res as Response).json() as { error: string };
    expect(body.error).toContain("add");
    expect(body.error).toContain("remove");
    expect(body.error).toContain("nope");
  });

  test("unknown intent → terse 400 in production", async () => {
    Bun.env.NODE_ENV = "production";
    const action = defineActions({ add: () => ({}) });
    const res = await action(argsWith("nope")) as Response;
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unknown action intent.");
  });

  test("missing intent → 400", async () => {
    const action = defineActions({ add: () => ({}) });
    const res = await action(argsWith(undefined)) as Response;
    expect(res.status).toBe(400);
  });

  test("awaits async handlers", async () => {
    const action = defineActions({
      slow: async () => { await Promise.resolve(); return { done: true }; },
    });
    expect(await action(argsWith("slow"))).toEqual({ done: true });
  });
});
