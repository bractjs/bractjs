import { defineEnv, env } from "@bractjs/bractjs";

// Typed, validated environment variables. BractJS imports this file at startup
// (dev, start, the compiled binary, the Node build), so a malformed variable
// stops the server with the full list. `client` values are baked into the
// browser bundle at build time: never put a secret there.
export default defineEnv({
  server: {
    // Hosting platforms (Fly, Render, Railway) assign it.
    PORT: env.number({ integer: true, min: 1, max: 65535 }).optional(),
    // The public origin, for absolute URLs in /sitemap.xml.
    ORIGIN: env.url().default("http://localhost:3000"),
  },
  client: {
    // Try `PUBLIC_APP_NAME="My Todos" bun run dev`.
    PUBLIC_APP_NAME: env.string().default("Bract Todo"),
  },
});
