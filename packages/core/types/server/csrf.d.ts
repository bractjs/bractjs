/**
 * The developer-facing explanation of a CSRF rejection. In dev it spells out
 * the accepted signals and the usual fix; in prod it stays terse so the 403
 * leaks nothing. Used for the plain route/action 403 bodies — the stream
 * handler embeds {@link csrfHint} in its SSE error event instead.
 */
export declare function csrfHint(): string;
/** A 403 Response for a rejected mutation: explanatory in dev, terse in prod. */
export declare function csrfForbiddenResponse(): Response;
export declare function isAllowedMutation(request: Request): boolean;
