// Fixture: a route loader's HttpError renders this ErrorBoundary in the route's
// place, with the error's status — not a JSON body.
import { HttpError, isHttpError } from "../../../../shared/errors.ts";

export function loader(): { widget: { name: string } } {
  throw new HttpError(404, "No such widget");
}

// Written as if the loader succeeded (as real routes are): on the error page
// they must not run, or `loaderData.widget` crashes the request.
export function meta({ loaderData }: { loaderData: ReturnType<typeof loader> }) {
  return [{ title: loaderData.widget.name }];
}

export function headers({ loaderData }: { loaderData: ReturnType<typeof loader> }) {
  return { "X-Widget": loaderData.widget.name };
}

export function ErrorBoundary({ error }: { error: unknown }) {
  return (
    <p id="route-boundary">
      {isHttpError(error) ? error.status : "?"}: {error instanceof Error ? error.message : ""}
    </p>
  );
}

export default function Missing() {
  return <p>unreachable — loader throws</p>;
}
