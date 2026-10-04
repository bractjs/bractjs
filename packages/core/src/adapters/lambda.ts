// AWS Lambda adapter: turns API Gateway / Lambda Function URL events into
// Requests for a BractJS fetch handler, and its Responses back into the
// result Lambda expects. Supports payload format 2.0 (HTTP APIs, Function
// URLs) and 1.0 (REST APIs). The response is buffered: Lambda's buffered
// invoke mode has no streaming, so a streamed document arrives whole.

import { setClientAddress } from "../server/client-address.ts";

type Headers1 = Record<string, string | undefined>;
type MultiHeaders = Record<string, string[] | undefined>;

/** API Gateway HTTP API / Function URL (payload format 2.0). */
export interface LambdaEventV2 {
  version: "2.0";
  rawPath: string;
  rawQueryString?: string;
  headers?: Headers1;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { domainName?: string; http: { method: string; sourceIp?: string } };
}

/** API Gateway REST API (payload format 1.0). */
export interface LambdaEventV1 {
  version?: "1.0";
  httpMethod: string;
  path: string;
  headers?: Headers1 | null;
  multiValueHeaders?: MultiHeaders | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  multiValueQueryStringParameters?: MultiHeaders | null;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { domainName?: string; identity?: { sourceIp?: string } };
}

export type LambdaEvent = LambdaEventV1 | LambdaEventV2;

export interface LambdaResult {
  statusCode: number;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  cookies?: string[];
  body: string;
  isBase64Encoded: boolean;
}

const TEXT_TYPE = /^(?:text\/|application\/(?:json|javascript|xml|[\w.+-]*\+(?:json|xml))|image\/svg\+xml)/i;

function isV2(event: LambdaEvent): event is LambdaEventV2 {
  return (event as LambdaEventV2).version === "2.0";
}

/** The Request a Lambda event describes. Exported for tests and custom wiring. */
export function lambdaEventToRequest(event: LambdaEvent): Request {
  const headers = new Headers();
  let method: string;
  let path: string;
  let query = "";
  let sourceIp: string | undefined;
  if (isV2(event)) {
    for (const [k, v] of Object.entries(event.headers ?? {})) if (v !== undefined) headers.set(k, v);
    if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));
    method = event.requestContext.http.method;
    path = event.rawPath;
    query = event.rawQueryString ?? "";
    sourceIp = event.requestContext.http.sourceIp;
  } else {
    if (event.multiValueHeaders) {
      for (const [k, values] of Object.entries(event.multiValueHeaders)) {
        for (const v of values ?? []) headers.append(k, v);
      }
    } else {
      for (const [k, v] of Object.entries(event.headers ?? {})) if (v !== undefined) headers.set(k, v);
    }
    method = event.httpMethod;
    path = event.path;
    const params = new URLSearchParams();
    if (event.multiValueQueryStringParameters) {
      for (const [k, values] of Object.entries(event.multiValueQueryStringParameters)) {
        for (const v of values ?? []) params.append(k, v);
      }
    } else {
      for (const [k, v] of Object.entries(event.queryStringParameters ?? {}))
        if (v !== undefined) params.append(k, v);
    }
    query = params.toString();
    sourceIp = event.requestContext?.identity?.sourceIp;
  }
  const host = headers.get("host") ?? event.requestContext?.domainName ?? "localhost";
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}${path}${query ? `?${query}` : ""}`;
  const hasBody = method !== "GET" && method !== "HEAD" && event.body != null && event.body !== "";
  const body = hasBody
    ? event.isBase64Encoded
      ? Buffer.from(event.body as string, "base64")
      : (event.body as string)
    : undefined;
  const request = new Request(url, { method, headers, body });
  if (sourceIp) setClientAddress(request, sourceIp);
  return request;
}

/** The Lambda result for a Response, in the event's payload format. */
export async function responseToLambdaResult(response: Response, v2: boolean): Promise<LambdaResult> {
  const type = response.headers.get("content-type") ?? "";
  const encoded = response.headers.has("content-encoding");
  const binary = encoded || (type !== "" && !TEXT_TYPE.test(type));
  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = binary ? Buffer.from(bytes).toString("base64") : new TextDecoder().decode(bytes);
  const cookies = response.headers.getSetCookie();
  if (v2) {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") headers[key] = value;
    });
    return { statusCode: response.status, headers, cookies, body, isBase64Encoded: binary };
  }
  const multiValueHeaders: Record<string, string[]> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") multiValueHeaders[key] = [value];
  });
  if (cookies.length) multiValueHeaders["set-cookie"] = cookies;
  return { statusCode: response.status, multiValueHeaders, body, isBase64Encoded: binary };
}

/**
 * A Lambda handler for a BractJS fetch handler — `build/node/handler.js`'s
 * `fetch` from `bractjs build --target node`:
 *
 *   // lambda.mjs
 *   import { createLambdaHandler } from "@bractjs/bractjs";
 *   import { fetch } from "./build/node/handler.js";
 *   export const handler = createLambdaHandler(fetch);
 */
export function createLambdaHandler(
  fetch: (request: Request) => Promise<Response>,
): (event: LambdaEvent) => Promise<LambdaResult> {
  return async (event) => responseToLambdaResult(await fetch(lambdaEventToRequest(event)), isV2(event));
}
