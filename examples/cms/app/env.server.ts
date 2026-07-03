// app/env.server.ts
//
// One place to read environment configuration for auth: the app's public URL
// (used to build OAuth redirect URIs), SMTP for the second-factor email, and
// the Google/Microsoft OAuth client credentials. Bun auto-loads `.env`.
//
// `.server.ts` keeps these (and any secrets) out of the client bundle.

export const IS_PROD = process.env.NODE_ENV === "production";
export const APP_NAME = process.env.APP_NAME ?? "Bract Gazette CMS";

// HMAC secret for the signed session / MFA / OAuth-state / flash cookies. In
// production we REFUSE to boot with a weak or missing value (or the public dev
// fallback) so a deploy can never silently sign sessions with a guessable key —
// which would let anyone forge an admin session. In dev a fixed fallback keeps
// the example zero-config.
const DEV_SESSION_SECRET = "dev-only-insecure-secret-change-me";
export const SESSION_SECRET: string = (() => {
  const secret = process.env.SESSION_SECRET;
  if (IS_PROD) {
    if (!secret || secret === DEV_SESSION_SECRET || secret.length < 16) {
      throw new Error(
        "SESSION_SECRET must be set to a strong, non-default value (>= 16 chars) in production. " +
          "Generate one with: openssl rand -base64 32",
      );
    }
    return secret;
  }
  return secret || DEV_SESSION_SECRET;
})();

// Absolute origin the app is served from. OAuth providers redirect back to
// `${APP_URL}/api/auth/<provider>/callback`, which must match the redirect URI
// registered in the Google/Azure console exactly.
export const APP_URL = (process.env.APP_URL ?? "http://localhost:3200").replace(/\/+$/, "");

export const smtp = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM ?? `${APP_NAME} <no-reply@example.com>`,
  get configured(): boolean {
    return Boolean(this.host && this.user && this.pass);
  },
};

export const google = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  },
};

export const microsoft = {
  clientId: process.env.MS_CLIENT_ID,
  clientSecret: process.env.MS_CLIENT_SECRET,
  // Default to "organizations" (work/school accounts only) rather than "common".
  // "common" also accepts personal Microsoft accounts, whose email is not
  // tenant-controlled — combined with the lack of an email_verified signal in
  // Graph, that would let an arbitrary personal account match a CMS admin email.
  // Set a specific tenant id for the tightest scope.
  tenant: process.env.MS_TENANT ?? "organizations",
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  },
};

export type OAuthProvider = "google" | "microsoft";

export function redirectUri(provider: OAuthProvider): string {
  return `${APP_URL}/api/auth/${provider}/callback`;
}
