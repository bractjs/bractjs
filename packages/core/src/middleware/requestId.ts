import { setRequestId } from "../server/request-context.ts";
import type { MiddlewareFn } from "../server/middleware.ts";

export interface RequestIdOptions {
  /** Header to read an incoming id from and to echo on the response. Default `X-Request-Id`. */
  header?: string;
  /** Make a new id. Default `crypto.randomUUID()`. */
  generate?: () => string;
  /**
   * Reuse an id the client or a proxy sent in `header` (load balancers set
   * one so logs line up across hops). Only ids of 1–128 characters from
   * `[A-Za-z0-9._:-]` are accepted, so a header can't inject into logs.
   * Default true.
   */
  trustIncoming?: boolean;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Give every request an id: reused from an incoming `X-Request-Id` when it's
 * safe, otherwise generated. It is echoed on the response, readable anywhere
 * in the request with `getRequestId()`, included by `requestLogger()`, and
 * shown by the built-in error pages so users can quote it. Register it first:
 *
 * ```ts
 * pipeline.use(requestId());
 * pipeline.use(requestLogger());
 * ```
 */
export function requestId(options: RequestIdOptions = {}): MiddlewareFn {
  const header = options.header ?? "X-Request-Id";
  const generate = options.generate ?? (() => crypto.randomUUID());
  const trustIncoming = options.trustIncoming ?? true;
  return async (ctx, next) => {
    const incoming = ctx.request.headers.get(header);
    const id = trustIncoming && incoming && SAFE_ID.test(incoming) ? incoming : generate();
    setRequestId(id);
    ctx.context.requestId = id;
    const res = await next();
    return withHeader(res, header, id);
  };
}

/** Set a header, copying the response when its headers are immutable. */
function withHeader(res: Response, name: string, value: string): Response {
  try {
    res.headers.set(name, value);
    return res;
  } catch {
    const copy = new Response(res.body, res);
    copy.headers.set(name, value);
    return copy;
  }
}
