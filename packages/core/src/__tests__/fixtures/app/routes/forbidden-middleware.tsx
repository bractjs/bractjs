// Fixture: route middleware that throws an HttpError. A document load must
// render the root error document with that status, matching /_data and /_action.
import { HttpError } from "../../../../shared/errors.ts";

export const middleware = [
  () => {
    throw new HttpError(403, "Forbidden by middleware");
  },
];

export default function Page() {
  return <p>never rendered</p>;
}
