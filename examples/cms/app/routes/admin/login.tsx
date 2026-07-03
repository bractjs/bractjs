import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, redirect, useActionData, useLoaderData, useNavigation, validate } from "@bractjs/bractjs";
import { LockKeyhole, LogIn } from "lucide-react";
import {
  authenticatePassword,
  beginPendingMfa,
  checkLoginRate,
  clearLoginRate,
  getAdmin,
  showSeedCredentials,
} from "../../auth.server.ts";
import { AuthShell } from "../../components/AuthShell.tsx";
import { OAuthButtons } from "../../components/OAuthButtons.tsx";
import { issueLoginCode } from "../../mfa.server.ts";
import { configuredProviders } from "../../oauth.server.ts";
import { clientIp } from "../../ratelimit.server.ts";
import { type LoginInput, LoginSchema } from "../../validation.ts";

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: "Sign-in failed (bad state). Please try again.",
  oauth_failed: "We couldn't complete that sign-in. Please try again.",
  oauth_unconfigured: "That provider isn't configured.",
  not_registered: "No CMS account is linked to that email. Ask an admin to add you.",
};

type LoaderData = {
  providers: { google: boolean; microsoft: boolean };
  error: string | null;
  seedHint: boolean;
};

export async function loader({ request }: LoaderArgs): Promise<LoaderData | Response> {
  if (await getAdmin(request)) throw redirect("/admin");
  const code = new URL(request.url).searchParams.get("error");
  return {
    providers: configuredProviders(),
    error: (code && OAUTH_ERRORS[code]) || null,
    seedHint: showSeedCredentials(),
  };
}

type ActionData = { error?: string };

export async function action({ request, formData }: ActionArgs): Promise<ActionData | Response> {
  let creds: LoginInput;
  try {
    creds = await validate<LoginInput>(LoginSchema, formData);
  } catch {
    return { error: "Enter your username and password." };
  }
  // Throttle the password factor itself (the MFA limiters only apply after a
  // correct password). Keyed by username so it can't be sidestepped by IP churn.
  const ip = clientIp(request);
  if (!checkLoginRate(creds.username, ip).ok) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }
  const user = await authenticatePassword(creds.username, creds.password);
  // Same message + same work whether the username or the password was wrong, so
  // the form can't be used to enumerate valid usernames.
  if (!user) return { error: "Invalid username or password." };
  clearLoginRate(creds.username); // legit sign-in — reset the counter
  const issued = await issueLoginCode(user, ip);
  if (!issued.ok) return { error: issued.reason };
  // Factor 1 passed: hold the user id in the signed pending cookie and move to
  // the code step. The full session cookie is NOT set until the code verifies.
  return redirect("/admin/verify", 302, { "Set-Cookie": await beginPendingMfa(user.id) });
}

export function meta() {
  return [{ title: "Sign in | CMS Admin" }];
}

export default function Login() {
  const { providers, error: oauthError, seedHint } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const error = actionData?.error ?? oauthError;
  return (
    <AuthShell title="Bract Gazette" subtitle="Sign in to manage content.">
      <Form method="post" className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        {error ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            <LockKeyhole size={15} /> {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <LogIn size={16} /> {busy ? "Checking…" : "Continue"}
        </button>
      </Form>
      <OAuthButtons providers={providers} />
      <p className="mt-5 text-center text-xs text-slate-400">
        Then we email you a one-time code.
        {seedHint ? (
          <>
            {" "}
            Seed login: <code className="font-mono">admin</code> / <code className="font-mono">admin123</code>
            .
          </>
        ) : null}
      </p>
    </AuthShell>
  );
}
