import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLambdaHandler, lambdaEventToRequest, responseToLambdaResult } from "../adapters/lambda.ts";
import { getClientAddress } from "../server/client-address.ts";
import { appFetchHandler } from "../server/serve.ts";

describe("lambdaEventToRequest", () => {
  test("payload 2.0: URL, cookies, base64 body, client address", async () => {
    const req = lambdaEventToRequest({
      version: "2.0",
      rawPath: "/posts/1",
      rawQueryString: "a=1&b=2",
      headers: { host: "app.example.com", "content-type": "text/plain" },
      cookies: ["sid=abc", "theme=dark"],
      body: Buffer.from("hello").toString("base64"),
      isBase64Encoded: true,
      requestContext: { http: { method: "POST", sourceIp: "203.0.113.9" } },
    });
    expect(req.url).toBe("https://app.example.com/posts/1?a=1&b=2");
    expect(req.method).toBe("POST");
    expect(req.headers.get("cookie")).toBe("sid=abc; theme=dark");
    expect(await req.text()).toBe("hello");
    expect(getClientAddress(req)).toBe("203.0.113.9");
  });

  test("payload 1.0: multi-value headers and query", () => {
    const req = lambdaEventToRequest({
      httpMethod: "GET",
      path: "/search",
      multiValueHeaders: { host: ["api.example.com"], accept: ["text/html", "application/json"] },
      multiValueQueryStringParameters: { tag: ["a", "b"] },
      body: null,
      requestContext: { identity: { sourceIp: "198.51.100.1" } },
    });
    expect(req.url).toBe("https://api.example.com/search?tag=a&tag=b");
    expect(req.headers.get("accept")).toBe("text/html, application/json");
    expect(getClientAddress(req)).toBe("198.51.100.1");
  });
});

describe("responseToLambdaResult", () => {
  test("text stays text; each Set-Cookie survives", async () => {
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
    headers.append("Set-Cookie", "a=1");
    headers.append("Set-Cookie", "b=2");
    const v2 = await responseToLambdaResult(new Response("<p>hi</p>", { status: 201, headers }), true);
    expect(v2).toMatchObject({
      statusCode: 201,
      body: "<p>hi</p>",
      isBase64Encoded: false,
      cookies: ["a=1", "b=2"],
    });
    expect(v2.headers?.["set-cookie"]).toBeUndefined();
    const v1 = await responseToLambdaResult(new Response("x", { headers }), false);
    expect(v1.multiValueHeaders?.["set-cookie"]).toEqual(["a=1", "b=2"]);
  });

  test("binary and compressed bodies are base64", async () => {
    const png = await responseToLambdaResult(
      new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }),
      true,
    );
    expect(png).toMatchObject({
      isBase64Encoded: true,
      body: Buffer.from([137, 80, 78, 71]).toString("base64"),
    });
    const gz = await responseToLambdaResult(
      new Response(Bun.gzipSync("{}"), {
        headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      }),
      true,
    );
    expect(gz.isBase64Encoded).toBe(true);
  });

  test("createLambdaHandler round-trips through a fetch handler", async () => {
    const handler = createLambdaHandler(async (req) => Response.json({ path: new URL(req.url).pathname }));
    const out = await handler({
      version: "2.0",
      rawPath: "/x",
      headers: { host: "h" },
      requestContext: { http: { method: "GET" } },
    });
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ path: "/x" });
  });
});

describe("appFetchHandler", () => {
  const TMP = resolve(import.meta.dir, ".tmp-app-fetch");
  const SRC = resolve(import.meta.dir, "..");
  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(resolve(TMP, "app/routes"), { recursive: true });
    await writeFile(
      resolve(TMP, "app/root.tsx"),
      `import { Outlet } from "${SRC}/client/components/Outlet.tsx";
export default function Root() { return <html><body><Outlet /></body></html>; }
`,
    );
    await writeFile(
      resolve(TMP, "app/routes/_index.tsx"),
      `export default function Home() { return <p>serverless home</p>; }\n`,
    );
    await writeFile(
      resolve(TMP, "app/server.ts"),
      `import { createServer } from "${SRC}/index.ts";
createServer({ appDir: ${JSON.stringify(resolve(TMP, "app"))}, compression: false, manifest: { clientEntry: "/c.js", routes: {} } });
`,
    );
    await writeFile(resolve(TMP, "app/no-server.ts"), `export const nothing = 1;\n`);
  });
  afterAll(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("returns the handler the entry's createServer() call configured, without listening", async () => {
    const fetch = await appFetchHandler(() => import(resolve(TMP, "app/server.ts")));
    const res = await fetch(new Request("http://x/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("serverless home");
  });

  test("an entry that never calls createServer() is an error", async () => {
    await expect(appFetchHandler(() => import(resolve(TMP, "app/no-server.ts")))).rejects.toThrow(
      "didn't call createServer",
    );
  });
});
