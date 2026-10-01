import { Link, useLoaderData } from "@bractjs/bractjs";

// Runs on the server for every request to "/" (and on client navigation).
export async function loader() {
  return { message: "Hello from BractJS!" };
}

export function meta() {
  return [{ title: "Home | {{APP_NAME}}" }];
}

export default function Index() {
  const { message } = useLoaderData<typeof loader>();

  return (
    <main className="page">
      <section className="card">
        <h1>{message}</h1>
        <p className="muted">
          Edit <code>app/routes/_index.tsx</code> to get started.
        </p>
      </section>
      <nav className="nav">
        <Link to="/about">About</Link>
      </nav>
    </main>
  );
}
