# {{APP_NAME}}

A [BractJS](https://github.com/bractjs/bractjs#readme) app — SSR framework for Bun + React 19.

## Commands

```sh
bun run dev       # Dev server with HMR (http://localhost:3000)
bun run build     # Production build (writes build/)
bun run start     # Serve the production build
bun run compile   # Single executable via bun build --compile
```

## Project structure

```
app/
├── root.tsx          # The <html> document shell (required)
├── server.ts         # Single-binary entry (bun build --compile)
└── routes/           # File-based routes
    ├── _index.tsx    # /
    └── about.tsx     # /about
bractjs.config.ts     # Framework configuration (defineConfig)
```

## Adding a route

Create a file under `app/routes/` — the path becomes the URL (`[id]` → `:id` params, `[[id]]` optional, `[...slug]` catch-all, `(group)/` groups without a URL segment). Export a `default` component, and optionally `loader`, `action`, `meta`, `headers`, `middleware`, or `searchSchema`.

```tsx
// app/routes/hello.tsx  →  /hello
import { useLoaderData } from "@bractjs/bractjs";

export function loader() {
  return { message: "Hello from the server" };
}

export default function Hello() {
  const { message } = useLoaderData<typeof loader>();
  return <h1>{message}</h1>;
}
```

Full documentation: https://github.com/bractjs/bractjs#readme
