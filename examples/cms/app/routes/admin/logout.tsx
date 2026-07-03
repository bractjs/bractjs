import { redirect } from "@bractjs/bractjs";
import { logoutCookie } from "../../auth.server.ts";

export async function loader() {
  // No GET page — bounce to login.
  throw redirect("/admin/login");
}

export async function action(): Promise<Response> {
  return redirect("/admin/login", 302, { "Set-Cookie": await logoutCookie() });
}

export default function Logout() {
  return null;
}
