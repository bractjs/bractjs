import { describe, expect, test } from "bun:test";
import { moduleView, parseDataPayload } from "../client/data-payload.ts";

// Every consumer of a /_data payload (navigation commit, SWR refetch,
// revalidation, SPA hydration) goes through parseDataPayload — these tests pin
// the defaults they all share.

describe("parseDataPayload", () => {
  test("extracts routing fields from a full payload", () => {
    const payload = parseDataPayload({
      route: { title: "x" },
      params: { id: "42" },
      search: { page: 2 },
      meta: [{ title: "Hi" }],
      matches: [{ id: "routes/x.tsx", pathname: "/x", params: {}, data: null, handle: undefined }],
    });
    expect(payload.params).toEqual({ id: "42" });
    expect(payload.search).toEqual({ page: 2 });
    expect(payload.meta).toEqual([{ title: "Hi" }]);
    expect(payload.matches).toHaveLength(1);
  });

  test("defaults every missing field (never undefined)", () => {
    const payload = parseDataPayload({});
    expect(payload.params).toEqual({});
    expect(payload.search).toEqual({});
    expect(payload.meta).toEqual([]);
    expect(payload.matches).toEqual([]);
  });

  test("null-ish fields fall back to the same defaults", () => {
    const payload = parseDataPayload({
      params: undefined,
      search: undefined,
      meta: undefined,
      matches: undefined,
    });
    expect(payload.params).toEqual({});
    expect(payload.search).toEqual({});
    expect(payload.meta).toEqual([]);
    expect(payload.matches).toEqual([]);
  });
});

describe("moduleView", () => {
  test("passes through a module object and nulls out null/undefined", () => {
    const mod = { clientLoader: () => ({}) };
    expect(moduleView(mod)?.clientLoader).toBe(mod.clientLoader);
    expect(moduleView(null)).toBeNull();
    expect(moduleView(undefined)).toBeNull();
  });
});
