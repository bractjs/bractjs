import { useLoaderData } from "bractjs";
import type { LoaderArgs } from "bractjs";
import { Link } from "bractjs";

interface HomeData {
  message: string;
}

export async function loader(_args: LoaderArgs): Promise<HomeData> {
  return { message: "Hello from BractJS!" };
}

export function meta() {
  return [{ title: "Home | {{APP_NAME}}" }];
}

export default function Index() {
  const { message } = useLoaderData<HomeData>();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>{message}</h1>
      <p>
        Edit <code>app/routes/_index.tsx</code> to get started.
      </p>
      <nav>
        <Link to="/about">About →</Link>
      </nav>
    </main>
  );
}
