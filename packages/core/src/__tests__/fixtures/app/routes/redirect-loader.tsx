// Fixture for the "/_data must surface a redirect THROWN from a loader" test.
// Auth gates like requireAdmin() do `throw redirect("/login")` inside a loader.
// On the /_data soft-nav path that thrown redirect must come back as a real 3xx
// (so the client follows it), not escape to the top-level handler as a 500.
import { redirect } from "../../../../server/response.ts";

export function loader(): never {
  throw redirect("/login");
}

export default function RedirectLoaderPage() {
  return <p>redirect loader page</p>;
}
