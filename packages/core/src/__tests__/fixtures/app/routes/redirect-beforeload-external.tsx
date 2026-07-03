// Fixture: beforeLoad RETURNS a raw off-origin redirect Response, built without
// the redirect() helper (so it carries no allowExternal brand). The request
// handler's sanitizeRedirect backstop must neutralize it to a 500 rather than
// emit the off-origin Location — the same treatment a raw off-origin redirect
// thrown from a loader gets. Covers BOTH the document and /_data branches.
export function beforeLoad(): Response {
  return new Response(null, { status: 302, headers: { Location: "https://evil.example/" } });
}

export function loader() {
  return { secret: "SHOULD-NOT-REACH" };
}

export default function RedirectBeforeLoadExternal() {
  return <p>should not render</p>;
}
