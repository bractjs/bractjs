// app/api/auth.ts — OAuth start/callback endpoints for Google & Microsoft.
//
// Registered as a side effect of importing this module (done from root.tsx, the
// one module loaded in dev, prod, and the compiled binary — app/server.ts never
// runs in dev). These live under /api/* because that's the only prefix the typed
// route() dispatcher serves. They're GET, so they're CSRF-exempt; the OAuth
// `state` cookie is the CSRF defense for the authorization-code flow instead.
//
// Authorization is the user table: upsertOAuthUser only signs in an account that
// already exists with the provider's verified email — never auto-provisions one.

import { redirect, route } from "@bractjs/bractjs";
import { clearOAuthState, loginCookie, readOAuthState, setOAuthState } from "../auth.server.ts";
import { upsertOAuthUser } from "../models/users.server.ts";
import { authorizeUrl, exchangeCode, isProviderConfigured, type OAuthProvider } from "../oauth.server.ts";

async function start(provider: OAuthProvider): Promise<Response> {
  if (!isProviderConfigured(provider)) {
    throw redirect(`/admin/login?error=oauth_unconfigured`);
  }
  const state = crypto.randomUUID();
  const headers = new Headers({ Location: authorizeUrl(provider, state) });
  headers.append("Set-Cookie", await setOAuthState(provider, state));
  // Off-origin (the provider): bypass the open-redirect guard explicitly.
  return new Response(null, { status: 302, headers });
}

async function callback(provider: OAuthProvider, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = await readOAuthState(request);
  const clearState = await clearOAuthState();

  if (!code || !state || !expected || expected.provider !== provider || expected.state !== state) {
    throw redirect("/admin/login?error=oauth_state", 302, { "Set-Cookie": clearState });
  }
  try {
    const profile = await exchangeCode(provider, code);
    const user = upsertOAuthUser({ ...profile, provider });
    if (!user) {
      // Verified at the provider, but no CMS account with this email exists.
      throw redirect("/admin/login?error=not_registered", 302, { "Set-Cookie": clearState });
    }
    const headers = new Headers({ Location: "/admin", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await loginCookie(user));
    headers.append("Set-Cookie", clearState);
    return new Response(null, { status: 302, headers });
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error(`[cms] OAuth ${provider} error:`, err);
    throw redirect("/admin/login?error=oauth_failed", 302, { "Set-Cookie": clearState });
  }
}

export const googleStart = route("GET", "/api/auth/google/start", () => start("google"));
export const googleCallback = route("GET", "/api/auth/google/callback", (_i, req) => callback("google", req));
export const microsoftStart = route("GET", "/api/auth/microsoft/start", () => start("microsoft"));
export const microsoftCallback = route("GET", "/api/auth/microsoft/callback", (_i, req) =>
  callback("microsoft", req),
);
