import { afterEach, expect, test } from "bun:test";
import { authorizeUrl, configuredProviders, exchangeCode, isProviderConfigured } from "../oauth.server.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub global fetch to return queued JSON responses in order. */
function queueFetch(responses: Array<{ ok?: boolean; body: unknown }>) {
  let i = 0;
  globalThis.fetch = (async () => {
    const r = responses[i++] ?? { ok: false, body: {} };
    return {
      ok: r.ok ?? true,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as Response;
  }) as unknown as typeof fetch;
}

test("authorizeUrl(google) targets Google with the right params + callback", () => {
  const url = new URL(authorizeUrl("google", "st-123"));
  expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe("openid email profile");
  expect(url.searchParams.get("state")).toBe("st-123");
  expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/google\/callback$/);
});

test("authorizeUrl(microsoft) targets the Microsoft tenant endpoint", () => {
  const url = new URL(authorizeUrl("microsoft", "st-456"));
  expect(url.hostname).toBe("login.microsoftonline.com");
  expect(url.pathname).toMatch(/\/oauth2\/v2\.0\/authorize$/);
  expect(url.searchParams.get("state")).toBe("st-456");
  expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/microsoft\/callback$/);
});

test("configuredProviders mirrors isProviderConfigured (env-driven)", () => {
  const p = configuredProviders();
  expect(p.google).toBe(isProviderConfigured("google"));
  expect(p.microsoft).toBe(isProviderConfigured("microsoft"));
});

test("exchangeCode(google) returns the profile only for a verified email", async () => {
  queueFetch([
    { body: { access_token: "tok" } },
    { body: { email: "user@example.com", email_verified: true, name: "User", picture: "http://x/a.png" } },
  ]);
  const profile = await exchangeCode("google", "code");
  expect(profile).toEqual({ email: "user@example.com", name: "User", avatarUrl: "http://x/a.png" });
});

test("exchangeCode(google) rejects an unverified email", async () => {
  queueFetch([
    { body: { access_token: "tok" } },
    { body: { email: "user@example.com", email_verified: false, name: "User" } },
  ]);
  await expect(exchangeCode("google", "code")).rejects.toThrow(/not verified/i);
});

test("exchangeCode(microsoft) matches on userPrincipalName, never the free-text mail attribute", async () => {
  // nOAuth: another tenant's admin can set `mail` to any address. Only the
  // domain-verified UPN may identify the user.
  queueFetch([
    { body: { access_token: "tok" } },
    {
      body: {
        mail: "admin@example.com",
        userPrincipalName: "Mallory@Attacker.onmicrosoft.com",
        displayName: "M",
      },
    },
  ]);
  const profile = await exchangeCode("microsoft", "code");
  expect(profile).toEqual({ email: "mallory@attacker.onmicrosoft.com", name: "M", avatarUrl: null });
});

test("exchangeCode(microsoft) rejects guest (#EXT#) and missing UPNs", async () => {
  queueFetch([
    { body: { access_token: "tok" } },
    { body: { mail: "admin@example.com", userPrincipalName: "admin_example.com#EXT#@evil.onmicrosoft.com" } },
  ]);
  await expect(exchangeCode("microsoft", "code")).rejects.toThrow(/guest/i);
  queueFetch([{ body: { access_token: "tok" } }, { body: { mail: "admin@example.com" } }]);
  await expect(exchangeCode("microsoft", "code")).rejects.toThrow(/sign-in name/i);
});
