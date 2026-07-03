// Fixture exercising the Phase 1/2/4 route exports end-to-end:
//   - `headers`  → Cache-Control on the document + /_data response
//   - `handle`   → surfaced via useMatches() (asserted from the payload)
//   - `middleware` → sets context (read by the loader) and stamps a header
import type { HeadersArgs, RouteMiddlewareFunction } from "../../../../shared/route-types.ts";

const setUser: RouteMiddlewareFunction = async (ctx, next) => {
  ctx.context.demoUser = "alice";
  const res = await next();
  res.headers.set("X-Demo-Mw", "1");
  return res;
};

export const middleware = [setUser];

export const handle = { breadcrumb: "Features" };

export function loader({ context }: { context: Record<string, unknown> }) {
  return { user: context.demoUser ?? null };
}

export function headers(_args: HeadersArgs) {
  return { "Cache-Control": "public, max-age=120" };
}

export default function FeaturesDemo() {
  return <p>features</p>;
}
