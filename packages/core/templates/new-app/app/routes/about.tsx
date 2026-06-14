import { Link } from "@bractjs/bractjs";

export function meta() {
  return [{ title: "About | {{APP_NAME}}" }];
}

export default function About() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>About</h1>
      <p>
        This app is built with{" "}
        <a href="https://github.com/bractjs" target="_blank" rel="noreferrer">
          BractJS
        </a>{" "}
        — an SSR framework for Bun + React 19.
      </p>
      <Link to="/">← Home</Link>
    </main>
  );
}
