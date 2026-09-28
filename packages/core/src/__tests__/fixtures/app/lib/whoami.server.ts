"use server";
// Fixture for getRequest(): a server action receives only the caller's
// arguments, so it reads the session cookie from the current request.
import { getRequest } from "../../../../server/request-context.ts";

export async function whoami(label: string) {
  return { label, cookie: getRequest().headers.get("Cookie") };
}
