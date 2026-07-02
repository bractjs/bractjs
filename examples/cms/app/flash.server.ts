// app/flash.server.ts — one-shot "flash" toast messages that survive a
// post/redirect/get. An admin action attaches `flashCookie(...)` to its redirect;
// the admin layout loader reads it (and its `headers()` returns FLASH_CLEAR to
// expire the cookie), so AdminShell pops it as a toast exactly once after the
// navigation. `.server.ts` keeps the signing secret out of the client bundle.

import { createCookieSession, json, redirect } from "@bractjs/bractjs";
import { IS_PROD, SESSION_SECRET } from "./env.server.ts";
import { firstMessage, type FormState } from "./form.ts";

export type FlashType = "success" | "error" | "info" | "warning";
export interface Flash { type: FlashType; message: string }

const secrets = [SESSION_SECRET];
const flash = createCookieSession({ name: "cms_flash", maxAge: 60, secrets, secure: IS_PROD, sameSite: "Lax" });

/** Set-Cookie carrying a one-shot toast to the next page — attach it to a redirect. */
export async function flashCookie(message: string, type: FlashType = "success"): Promise<string> {
  const session = await flash.getSession(null);
  session.set("type", type);
  session.set("message", message);
  return flash.commitSession(session);
}

/** Read the pending flash (or null). The layout's `headers()` clears it via FLASH_CLEAR. */
export async function readFlash(request: Request): Promise<Flash | null> {
  const session = await flash.getSession(request.headers.get("cookie"));
  const message = session.get("message") as string | undefined;
  if (!message) return null;
  return { message, type: (session.get("type") as FlashType) ?? "info" };
}

/** Static Set-Cookie that expires the flash cookie (HttpOnly → must clear server-side). */
export const FLASH_CLEAR = "cms_flash=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

/** Redirect after a successful mutation, popping a one-shot success toast. */
export async function flashRedirect(to: string, message: string, type: FlashType = "success"): Promise<Response> {
  return redirect(to, 303, { "Set-Cookie": await flashCookie(message, type) });
}

/**
 * Stay on the current page after a successful mutation, popping a success toast.
 * Use this (not `flashRedirect`) when the action shouldn't navigate — e.g. a
 * same-page "save" where the user keeps editing. Returning a non-redirect `json`
 * lets the post-action revalidation read the flash cookie; a redirect would
 * instead make the client follow it into a full-document GET, whose layout
 * `headers()` clears the flash before the soft-nav revalidation can read it.
 */
export async function flashStay(message: string, type: FlashType = "success", data: unknown = {}): Promise<Response> {
  return json(data, { headers: { "Set-Cookie": await flashCookie(message, type) } });
}

/**
 * Return inline form errors AND pop an error toast. The action stays on the same
 * page so field-level errors still render via `useActionData`, while the flash
 * cookie — read by the admin layout on the post-action revalidation — pops a
 * matching `toast.error`. The toast text prefers `error`, then the first field
 * error, then `fallback`.
 */
export async function flashFail(state: FormState, fallback = "Something went wrong."): Promise<Response> {
  const message = state.error ?? firstMessage(state.fieldErrors) ?? fallback;
  return json(state, { headers: { "Set-Cookie": await flashCookie(message, "error") } });
}
