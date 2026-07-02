// app/api/posts.ts — a typed, public JSON feed of published posts (headless API).
//
// `route(method, path, handler)` registers a type-safe endpoint under `/api/*`.
// Registration is a side effect of importing this module, so it must be imported
// once on the server. The dev server never runs app/server.ts, so we import this
// from root.tsx — the one module loaded in dev, prod, and the compiled binary.
//
// This is read-only and intentionally public (a headless feed any site can
// fetch), so it must NOT rely on the admin session cookie — and it doesn't: it
// only ever returns *published* content. A GET is CSRF-exempt anyway.

import { route } from "@bractjs/bractjs";
import { listPublished } from "../models/posts.server.ts";

type FeedPost = {
  title: string;
  slug: string;
  excerpt: string;
  url: string;
  category: string | null;
  publishedAt: number | null;
};

// GET /api/posts → { posts: FeedPost[] }
// Try it: `curl http://localhost:3200/api/posts`
//
// `:param` segments aren't injected into the handler — read query/path from the
// raw Request (2nd arg) yourself. Here we read an optional `?limit=`.
export const getPublishedFeed = route("GET", "/api/posts", (_input, request) => {
  const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 20;
  const posts: FeedPost[] = listPublished({ limit }).map((p) => ({
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    url: `/posts/${p.slug}`,
    category: p.category?.name ?? null,
    publishedAt: p.publishedAt,
  }));
  return { posts };
});

// A mutating route would be CSRF-protected BY DEFAULT — a cross-site POST with
// the user's cookie riding along gets a 403, exactly like a forged <Form>
// submit. You'd authorize inside the handler (the CSRF gate is not auth). The
// `{ csrf: false }` opt-out is only for credential-free public endpoints
// (webhooks, token-authed APIs) — never for anything that trusts the session:
//
//   export const ingestWebhook = route("POST", "/api/webhook", handleWebhook, { csrf: false });
