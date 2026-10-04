// Smoke test for `bractjs build --target node`'s serverless entry: the
// handler.js bundle runs on plain Node, as fetch() and as an AWS Lambda handler.
// Run from examples/todo after `pnpm build:node` (CI: the node e2e leg).
import assert from "node:assert/strict";
import { resolve } from "node:path";

const { fetch, handler } = await import(resolve("build/node/handler.js"));

const page = await fetch(new Request("http://localhost/about"));
assert.equal(page.status, 200);
assert.match(await page.text(), /About this demo/);

const lambda = await handler({
  version: "2.0",
  rawPath: "/",
  rawQueryString: "",
  headers: { host: "example.lambda-url.us-east-1.on.aws" },
  requestContext: { http: { method: "GET", sourceIp: "203.0.113.1" } },
});
assert.equal(lambda.statusCode, 200);
assert.match(lambda.headers["content-type"], /text\/html/);
assert.match(lambda.body, /Todo board/);

console.log("serverless smoke: ok");
