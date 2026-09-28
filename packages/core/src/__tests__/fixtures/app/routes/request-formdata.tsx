// Fixture for the Remix/React Router-style action that reads the body itself
// via `await request.formData()` instead of the pre-parsed `formData` arg. The
// framework has already consumed the body, so this must answer from the parsed
// copy rather than throwing "Body already used".
import type { ActionArgs } from "../../../../shared/route-types.ts";

export async function action({ request, formData }: ActionArgs) {
  const fromRequest = await request.formData();
  const again = await request.formData(); // repeat reads work too
  return {
    title: fromRequest.get("title"),
    sameAsArg: fromRequest === formData && again === formData,
    url: new URL(request.url).pathname,
    method: request.method,
    isRequest: request instanceof Request,
  };
}

export default function RequestFormDataPage() {
  return <p>request.formData page</p>;
}
