import { useLoaderData } from "../../../../../../client/hooks/useLoaderData.ts";

export function loader() {
  return { title: "Guarded page" };
}

export default function GuardedPage() {
  const { title } = useLoaderData<typeof loader>();
  return <p id="guarded-route">{title}</p>;
}
