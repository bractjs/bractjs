// Fixture: HttpError from a route with no ErrorBoundary (and a root without one)
// renders the built-in fallback.
import { HttpError } from "../../../../shared/errors.ts";

export function loader(): never {
  throw new HttpError(410, "Gone for good");
}

export default function MissingBare() {
  return <p>unreachable — loader throws</p>;
}
