// Security invariant: `ssr: false` must NOT skip beforeLoad — it is the auth
// gate, and it runs for document GETs and /_data alike regardless of SSR mode.
export const ssr = false;

export function beforeLoad() {
  return new Response("Forbidden", { status: 403 });
}

export function loader() {
  return { secret: "GATED-CLIENT-ONLY-DATA" };
}

export default function ProtectedClientOnlyPage() {
  return <p>protected client-only</p>;
}
