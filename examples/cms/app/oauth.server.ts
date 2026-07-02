// app/oauth.server.ts
//
// OAuth 2.0 / OpenID Connect authorization-code flow for "Sign in with Google"
// and "Sign in with Microsoft". We only ever read the verified email from the
// provider; the user table itself is the allowlist (see upsertOAuthUser), so an
// arbitrary Google account can't become a CMS admin.

import { google, microsoft, redirectUri, type OAuthProvider } from "./env.server.ts";

export type { OAuthProvider } from "./env.server.ts";

export interface OAuthProfile {
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider === "google" ? google.configured : microsoft.configured;
}

export function configuredProviders(): { google: boolean; microsoft: boolean } {
  return { google: google.configured, microsoft: microsoft.configured };
}

/** Build the provider's authorize URL for the redirect step. */
export function authorizeUrl(provider: OAuthProvider, state: string): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: google.clientId!,
      redirect_uri: redirectUri("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: microsoft.clientId!,
    redirect_uri: redirectUri("microsoft"),
    response_type: "code",
    scope: "openid email profile User.Read",
    state,
    response_mode: "query",
  });
  return `https://login.microsoftonline.com/${microsoft.tenant}/oauth2/v2.0/authorize?${params}`;
}

/** Exchange an authorization code for the user's verified profile. */
export async function exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
  return provider === "google" ? exchangeGoogle(code) : exchangeMicrosoft(code);
}

async function exchangeGoogle(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId!,
      client_secret: google.clientSecret!,
      redirect_uri: redirectUri("google"),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${await infoRes.text()}`);
  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  if (!info.email) throw new Error("Google account has no email");
  // Only trust verified emails; otherwise an attacker with an unverified address
  // matching an existing account could hijack it. (Google sends bool or "true".)
  if (info.email_verified !== true && info.email_verified !== "true") {
    throw new Error("Google email is not verified");
  }
  return { email: info.email, name: info.name ?? null, avatarUrl: info.picture ?? null };
}

async function exchangeMicrosoft(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${microsoft.tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: microsoft.clientId!,
        client_secret: microsoft.clientSecret!,
        redirect_uri: redirectUri("microsoft"),
        grant_type: "authorization_code",
        scope: "openid email profile User.Read",
      }),
    },
  );
  if (!tokenRes.ok) throw new Error(`Microsoft token exchange failed: ${await tokenRes.text()}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Microsoft Graph failed: ${await infoRes.text()}`);
  const info = (await infoRes.json()) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };
  const email = info.mail ?? info.userPrincipalName;
  if (!email) throw new Error("Microsoft account has no email");
  // Graph exposes no email_verified. For work/school accounts mail/UPN are
  // tenant-controlled (trustworthy); prefer a specific MS_TENANT in production.
  return { email, name: info.displayName ?? null, avatarUrl: null };
}
