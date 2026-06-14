// Selective SSR: `ssr: false` — the loader must NOT run during document SSR
// and the Fallback must render in the component's place. The client completes
// the render via /_data after hydration.
export const ssr = false;

export function loader() {
  return { secret: "CLIENT-ONLY-LOADER-DATA" };
}

export function Fallback() {
  return <p>client-only fallback</p>;
}

export default function ClientOnlyPage() {
  return <p>client-only component</p>;
}
