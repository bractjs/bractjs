import type { HeadersArgs, LoaderArgs } from "@bractjs/bractjs";
import { Outlet } from "@bractjs/bractjs";
import { type AdminUser, getAdmin, requireAdmin } from "../../auth.server.ts";
import { FLASH_CLEAR, type Flash, readFlash } from "../../flash.server.ts";

// Public admin sub-paths that must NOT be gated (otherwise an unauthenticated
// visitor to /admin/login would loop). `/admin/verify` is the second sign-in
// factor: it runs before a full session exists, so it can't require one.
const PUBLIC_PATHS = new Set(["/admin/login", "/admin/verify", "/admin/logout"]);

type LayoutData = { user: AdminUser | null; flash: Flash | null };

// Gating runs here (covers full-page GET and /_data soft-nav); the returned
// `user` rides in useMatches() so the chrome (rendered in root.tsx, since bractjs
// doesn't mount intermediate layout components) can label itself. `flash` rides
// along too, so AdminShell can pop a one-shot toast after a redirecting action.
export async function loader({ request }: LoaderArgs): Promise<LayoutData> {
  const pathname = new URL(request.url).pathname;
  const flash = await readFlash(request);
  if (PUBLIC_PATHS.has(pathname)) return { user: await getAdmin(request), flash };
  return { user: await requireAdmin(request), flash };
}

// Expire the flash cookie on the same response that delivered it, so the toast
// pops exactly once. Runs on both the full document load and the /_data soft-nav.
export function headers({ loaderData }: HeadersArgs<LayoutData>) {
  return loaderData.flash ? { "Set-Cookie": FLASH_CLEAR } : undefined;
}

export default function AdminLayout() {
  return <Outlet />;
}
