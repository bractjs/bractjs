// A route whose loader throws a plain Error — for asserting that the failure is
// reported with the route file's location (in dev) rather than anonymously.
export function loader() {
  throw new Error("kaboom from loader");
}

export default function Boom() {
  return <p>unreachable — loader throws</p>;
}
