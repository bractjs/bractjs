/**
 * Cross-origin POST/PUT/DELETE/PATCH protection.
 * Allow when: request carries X-BractJS-Action header (client-issued, blocked
 * cross-origin by CORS for non-simple requests), OR the Origin header matches
 * the request URL's origin.
 */
export function isAllowedMutation(request: Request): boolean {
  if (request.headers.get("X-BractJS-Action")) return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
