// Fixture: a beforeLoad gate that THROWS redirect() (the React Router /
// TanStack idiom). Must become a 302 on a full document load as well as on
// /_data — not escape the document branch as a 500.
import { redirect } from "../../../../server/response.ts";

export function beforeLoad(): void {
  throw redirect("/login");
}

export default function Page() {
  return <p>never rendered</p>;
}
