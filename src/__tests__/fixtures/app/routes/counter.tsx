// Module-level mutable state so tests can prove the submit → revalidate
// contract: a mutation changes what the loader returns on the next /_data.
let count = 0;

export function loader() {
  return { count };
}

export async function action() {
  count++;
  return { ok: true, count };
}

export default function CounterPage() {
  return <p>counter</p>;
}
