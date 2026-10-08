// Fixture: a loader that RETURNS redirect() (React Router honours a returned
// redirect exactly like a thrown one). Document → 302, /_data → 204 envelope.
import { redirect } from "../../../../server/response.ts";

export function loader(): Response {
  return redirect("/login");
}

export default function RedirectLoaderReturnPage() {
  return <p>never rendered</p>;
}
