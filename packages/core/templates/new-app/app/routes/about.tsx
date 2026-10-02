import { Link } from "@bractjs/bractjs";

export function meta() {
  return [{ title: "About | {{APP_NAME}}" }];
}

export default function About() {
  return (
    <main className="page">
      <section className="card">
        <h1>About</h1>
        <p className="muted">
          This app is built with{" "}
          <a href="https://github.com/bractjs/bractjs" target="_blank" rel="noreferrer">
            BractJS
          </a>
          , an SSR framework for Bun + React 19.
        </p>
      </section>
      <nav className="nav">
        <Link to="/">Home</Link>
      </nav>
    </main>
  );
}
