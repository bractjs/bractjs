// Fixture: an intermediate layout that renders — it wraps every /nested/* route
// and reads its OWN loader data (not the route's) via useLoaderData().
import { Outlet } from "../../../../../client/components/Outlet.tsx";
import { useLoaderData } from "../../../../../client/hooks/useLoaderData.ts";

export function loader() {
  return { section: "Nested section" };
}

export default function NestedLayout() {
  const { section } = useLoaderData<typeof loader>();
  return (
    <section id="nested-layout">
      <h2>{section}</h2>
      <Outlet />
    </section>
  );
}
