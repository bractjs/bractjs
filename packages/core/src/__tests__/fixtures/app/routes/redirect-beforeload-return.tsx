// Fixture: a beforeLoad gate that RETURNS a same-origin redirect. On /_data it
// must travel as the 204 envelope like a thrown one — the pipeline sees the
// target URL, so the envelope has to be applied by the /_data branch itself.
import { redirect } from "../../../../server/response.ts";

export function beforeLoad(): Response {
  return redirect("/login");
}

export default function Page() {
  return <p>never rendered</p>;
}
