// The admin layout's headers() must forward an action's data(…, { headers })
// (the framework only applies them through a headers() export once one exists).
import { expect, test } from "bun:test";
import { FLASH_CLEAR } from "../flash.server.ts";
import { headers } from "../routes/admin/layout.tsx";

const args = (flash: boolean) => ({
  loaderData: { user: null, flash: flash ? { type: "info" as const, message: "m" } : null },
  params: {},
  request: new Request("http://x/admin/login", { method: "POST" }),
  parentHeaders: new Headers(),
  loaderHeaders: new Headers(),
  actionHeaders: new Headers({ "Retry-After": "7", "Set-Cookie": "a=1" }),
});

test("forwards actionHeaders and appends the flash-clear cookie", () => {
  const out = new Headers(headers(args(true)));
  expect(out.get("Retry-After")).toBe("7");
  expect(out.getSetCookie()).toEqual(["a=1", FLASH_CLEAR]);
});

test("without a flash, only the action's headers come through", () => {
  const out = new Headers(headers(args(false)));
  expect(out.get("Retry-After")).toBe("7");
  expect(out.getSetCookie()).toEqual(["a=1"]);
});
