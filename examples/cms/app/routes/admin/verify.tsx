import type { ActionArgs, LoaderArgs } from "@bractjs/bractjs";
import { Form, redirect, useActionData, useLoaderData, useNavigation, validate } from "@bractjs/bractjs";
import { ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { clearPendingMfa, getAdmin, getPendingUserId, loginCookie } from "../../auth.server.ts";
import { AuthShell } from "../../components/AuthShell.tsx";
import { issueLoginCode, verifyLoginCode } from "../../mfa.server.ts";
import { getUserById } from "../../models/users.server.ts";
import { clientIp } from "../../ratelimit.server.ts";
import { type CodeInput, CodeSchema } from "../../validation.ts";

/** a***@example.com — enough to confirm the right inbox without echoing it. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  const head = name!.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, name!.length - 1))}@${domain}`;
}

type LoaderData = { maskedEmail: string };

export async function loader({ request }: LoaderArgs): Promise<LoaderData | Response> {
  if (await getAdmin(request)) throw redirect("/admin");
  const pendingId = await getPendingUserId(request);
  if (!pendingId) throw redirect("/admin/login");
  const user = getUserById(pendingId);
  if (!user?.email) throw redirect("/admin/login");
  return { maskedEmail: maskEmail(user.email) };
}

type ActionData = { error?: string; resent?: boolean };

export async function action({ request, formData }: ActionArgs): Promise<ActionData | Response> {
  const pendingId = await getPendingUserId(request);
  if (!pendingId) throw redirect("/admin/login");

  if (String(formData.get("intent") ?? "") === "resend") {
    const user = getUserById(pendingId);
    if (!user) throw redirect("/admin/login");
    const issued = await issueLoginCode(user, clientIp(request));
    return issued.ok ? { resent: true } : { error: issued.reason };
  }

  let parsed: CodeInput;
  try {
    parsed = await validate<CodeInput>(CodeSchema, formData);
  } catch {
    return { error: "Enter the 6-digit code." };
  }
  const result = verifyLoginCode(pendingId, parsed.code, clientIp(request));
  if (!result.ok) return { error: result.reason };

  const user = getUserById(pendingId);
  if (!user) throw redirect("/admin/login");
  // Second factor complete: issue the real session and drop the pending cookie.
  const headers = new Headers({ Location: "/admin" });
  headers.append("Set-Cookie", await loginCookie(user));
  headers.append("Set-Cookie", await clearPendingMfa());
  return new Response(null, { status: 302, headers });
}

export function meta() {
  return [{ title: "Verify | CMS Admin" }];
}

export default function Verify() {
  const { maskedEmail } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  return (
    <AuthShell title="Check your email" subtitle={`We sent a 6-digit code to ${maskedEmail}.`}>
      <Form method="post" className="space-y-4">
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700">
            Sign-in code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-lg tracking-[0.5em] text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        {actionData?.error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {actionData.error}
          </p>
        ) : null}
        {actionData?.resent ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            A new code is on its way.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <ShieldCheck size={16} /> {busy ? "Verifying…" : "Verify & sign in"}
        </button>
      </Form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Form method="post" className="m-0">
          <input type="hidden" name="intent" value="resend" />
          <button
            type="submit"
            className="flex items-center gap-1.5 text-slate-500 transition hover:text-slate-800"
          >
            <RotateCcw size={14} /> Resend code
          </button>
        </Form>
        <a
          href="/admin/login"
          className="flex items-center gap-1.5 text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft size={14} /> Start over
        </a>
      </div>
    </AuthShell>
  );
}
