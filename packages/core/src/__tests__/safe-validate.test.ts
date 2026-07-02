import { describe, expect, test } from "bun:test";
import { isValidationResponse, readValidationError, type Schema, safeValidate } from "../server/validate.ts";

// A Zod/Valibot-style safeParse schema: requires non-empty `title`.
const TitleSchema: Schema<{ title: string }> = {
  safeParse(input: unknown) {
    const raw = (input as { title?: unknown })?.title;
    const title = typeof raw === "string" ? raw.trim() : "";
    if (!title) {
      return { success: false, error: { issues: [{ path: ["title"], message: "Title is required." }] } };
    }
    return { success: true, data: { title } };
  },
};

// A `.parse()`-only schema that throws.
const ThrowingSchema: Schema<{ n: number }> = {
  parse(input: unknown) {
    const n = Number((input as { n?: unknown })?.n);
    if (!Number.isFinite(n)) throw new Error("n must be a number");
    return { n };
  },
};

describe("safeValidate", () => {
  test("ok path returns parsed data", async () => {
    const r = await safeValidate(TitleSchema, { title: "  hi  " });
    expect(r).toEqual({ ok: true, data: { title: "hi" } });
  });

  test("safeParse failure → fieldErrors + firstError", async () => {
    const r = await safeValidate(TitleSchema, { title: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors).toEqual({ title: ["Title is required."] });
      expect(r.firstError).toBe("Title is required.");
    }
  });

  test("parse-throw failure → _ field + message", async () => {
    const r = await safeValidate(ThrowingSchema, { n: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors._).toEqual(["n must be a number"]);
      expect(r.firstError).toBe("n must be a number");
    }
  });

  test("works with FormData input", async () => {
    const fd = new FormData();
    fd.set("title", "from form");
    const r = await safeValidate(TitleSchema, fd);
    expect(r).toEqual({ ok: true, data: { title: "from form" } });
  });
});

describe("isValidationResponse", () => {
  test("true for the Response thrown by validation", async () => {
    // safeValidate swallows it, so trigger the throw via the underlying runSchema path:
    let thrown: unknown;
    try {
      const { validate } = await import("../server/validate.ts");
      await validate(TitleSchema, { title: "" });
    } catch (e) {
      thrown = e;
    }
    expect(isValidationResponse(thrown)).toBe(true);
  });

  test("false for a plain 400 Response without the validation statusText", () => {
    expect(isValidationResponse(new Response(null, { status: 400 }))).toBe(false);
    expect(isValidationResponse(new Error("nope"))).toBe(false);
    expect(isValidationResponse(null)).toBe(false);
  });
});

describe("readValidationError", () => {
  test("parses { errors } body", async () => {
    const res = Response.json({ errors: { email: ["Invalid"] } }, { status: 400 });
    const { fieldErrors, firstError } = await readValidationError(res);
    expect(fieldErrors).toEqual({ email: ["Invalid"] });
    expect(firstError).toBe("Invalid");
  });

  test("falls back gracefully on non-JSON body", async () => {
    const res = new Response("not json", { status: 400 });
    const { fieldErrors, firstError } = await readValidationError(res);
    expect(fieldErrors).toEqual({});
    expect(firstError).toBe("Please check your input.");
  });
});
