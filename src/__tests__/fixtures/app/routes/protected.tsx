// Fixture for the /_data auth-parity test. beforeLoad() is the contract point
// where auth must live: it runs for BOTH full-page GET and the /_data soft-nav
// JSON endpoint, so a route gated here cannot leak loader data via /_data.
export function beforeLoad(): Response {
  return new Response("Forbidden", { status: 403 });
}

export function loader() {
  // Must never reach the client — beforeLoad short-circuits first.
  return { secret: "TOP-SECRET-LOADER-DATA" };
}

export default function Protected() {
  return <p>protected</p>;
}
