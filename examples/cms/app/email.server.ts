// app/email.server.ts
//
// Delivers the second-factor sign-in code over SMTP via nodemailer. When SMTP
// isn't configured (the default for local dev), the code is printed to the
// server console so the MFA flow stays usable without any secrets.
//
// nodemailer is a Node-only dependency; importing it in a `.server.ts` module
// guarantees it never reaches the client bundle (it'd be stubbed there).

import nodemailer from "nodemailer";
import { APP_NAME, APP_URL, IS_PROD, smtp } from "./env.server.ts";

const APP_HOST = (() => {
  try {
    return new URL(APP_URL).host;
  } catch {
    return APP_URL;
  }
})();

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!smtp.configured) return null;
  transport ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user!, pass: smtp.pass! },
  });
  return transport;
}

/** Send (or, in dev, log) a one-time sign-in code. Throws if SMTP delivery fails. */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  const t = getTransport();
  if (!t) {
    // Fail closed in production: logging the second factor to the console (or
    // silently skipping email) would effectively disable 2FA and leak codes to
    // anyone with log access. Force SMTP to be configured for real deployments.
    if (IS_PROD) {
      throw new Error(
        "SMTP is not configured; refusing to issue a 2FA code without email delivery in production.",
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\n  ✉️  ${APP_NAME} sign-in code for ${email}: ${code}\n`);
    return;
  }
  // The `@host #code` line lets Safari/Mail on macOS & iOS recognize the
  // one-time code and offer to autofill it (pairs with
  // autocomplete="one-time-code" on the input). Keep it last, on its own line.
  const autofill = `@${APP_HOST} #${code}`;
  await t.sendMail({
    from: smtp.from,
    to: email,
    subject: `Your ${APP_NAME} sign-in code: ${code}`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\n${autofill}`,
    html: `<p>Your sign-in code is <strong style="font-size:1.4em;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p><p style="color:#888;font-size:.85em">${autofill}</p>`,
  });
}
