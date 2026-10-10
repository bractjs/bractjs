import type { ActionArgs } from "@bractjs/bractjs";
import { redirect } from "@bractjs/bractjs";
import { getAdmin, logoutCookie } from "../../auth.server.ts";
import { bumpSessionEpoch } from "../../models/users.server.ts";

export async function loader() {
  // No GET page — bounce to login.
  throw redirect("/admin/login");
}

// The session cookie is stateless, so clearing it in the browser alone leaves
// a copied cookie valid until it expires. Bumping the user's session epoch
// revokes every session issued to them — this device and any other (a pending
// MFA cookie for the same account included) — on its next request.
export async function action({ request }: ActionArgs): Promise<Response> {
  const user = await getAdmin(request);
  if (user) bumpSessionEpoch(user.id);
  return redirect("/admin/login", 302, { "Set-Cookie": await logoutCookie() });
}

export default function Logout() {
  return null;
}
