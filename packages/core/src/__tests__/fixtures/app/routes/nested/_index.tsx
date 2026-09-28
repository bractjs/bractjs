import { useLoaderData } from "../../../../../client/hooks/useLoaderData.ts";

export function loader() {
  return { title: "Nested index" };
}

export default function NestedIndex() {
  const { title } = useLoaderData<typeof loader>();
  return <p id="nested-route">{title}</p>;
}
