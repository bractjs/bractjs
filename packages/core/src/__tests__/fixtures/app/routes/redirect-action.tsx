// Fixture for the "action returns (not throws) a redirect" regression test.
// The documented pattern (README §5/§6) is `return redirect("/")`. The handler
// must surface that as a real 3xx so `<Form>`/the browser follows it — not wrap
// it into a 200 JSON body.
import { redirect } from "../../../../server/response.ts";

export async function action() {
  return redirect("/");
}

export default function RedirectActionPage() {
  return <p>redirect action page</p>;
}
