// Fixture for the defer() transport: a Deferred can't be JSON-serialized, so the
// SSR data island carries a marker and the value follows the HTML stream; /_data
// inlines the settled value. `?fail` rejects with an HttpError.
import { Await } from "../../../../client/components/Await.tsx";
import { useLoaderData } from "../../../../client/hooks/useLoaderData.ts";
import { defer } from "../../../../shared/deferred.ts";
import { HttpError } from "../../../../shared/errors.ts";

export async function loader({ request }: { request: Request }) {
  const fail = new URL(request.url).searchParams.has("fail");
  return defer({
    fast: "shell-ready",
    slow: new Promise<{ items: string[] }>((resolve, reject) =>
      setTimeout(
        () => (fail ? reject(new HttpError(404, "slow-thing-missing")) : resolve({ items: ["a", "b"] })),
        30,
      ),
    ),
  });
}

export default function DeferredPage() {
  const { fast, slow } = useLoaderData<typeof loader>();
  return (
    <main>
      <p>{fast}</p>
      <Await resolve={slow} fallback={<p>loading</p>}>
        {(v) => <p>items: {v.items.join(",")}</p>}
      </Await>
    </main>
  );
}
