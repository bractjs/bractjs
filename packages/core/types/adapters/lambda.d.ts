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
    requestContext: {
        domainName?: string;
        http: {
            method: string;
            sourceIp?: string;
        };
    };
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
    requestContext?: {
        domainName?: string;
        identity?: {
            sourceIp?: string;
        };
    };
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
/** The Request a Lambda event describes. Exported for tests and custom wiring. */
export declare function lambdaEventToRequest(event: LambdaEvent): Request;
/** The Lambda result for a Response, in the event's payload format. */
export declare function responseToLambdaResult(response: Response, v2: boolean): Promise<LambdaResult>;
/**
 * A Lambda handler for a BractJS fetch handler — `build/node/handler.js`'s
 * `fetch` from `bractjs build --target node`:
 *
 *   // lambda.mjs
 *   import { createLambdaHandler } from "@bractjs/bractjs";
 *   import { fetch } from "./build/node/handler.js";
 *   export const handler = createLambdaHandler(fetch);
 */
export declare function createLambdaHandler(fetch: (request: Request) => Promise<Response>): (event: LambdaEvent) => Promise<LambdaResult>;
export {};
