// @bractjs/bractjs/testing against the fixture app: the real pipeline,
// in-process, from source.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { redirect } from "../server/response.ts";
import { HttpError } from "../shared/errors.ts";
import type { ActionArgs, LoaderArgs } from "../shared/route-types.ts";
import { callAction, callLoader, createTestApp } from "../testing-entry.ts";

const appDir = join(import.meta.dir, "fixtures", "app");

describe("createTestApp", () => {
  test("renders a document through the real pipeline", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    const res = await app.get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Index page content");
    expect(html).toContain("<title>BractJS Test Home</title>");
  });

  test("data() returns the soft-navigation payload", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    const data = await app.data<{ route: { message: string } }>("/");
    expect(data.route).toEqual({ message: "hello from bractjs" });
  });

  test("data() throws on a non-2xx /_data answer", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    await expect(app.data("/protected")).rejects.toThrow("answered 403");
  });

  test("submit() returns the action's JSON (and passes the CSRF gate)", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    const res = await app.submit("/", { name: "Ada" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ submitted: true, name: "Ada" });
  });

  test("post() behaves like a no-JS form: a redirect stays a 3xx, cookies land in the jar", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    const res = await app.post("/redirect-action", {});
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
    expect(app.cookies.get("flash")).toBe("saved");
  });

  test("submit() of a redirecting action gets the client envelope", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    const res = await app.submit("/redirect-action", {});
    expect(res.status).toBe(204);
    expect(res.headers.get("X-BractJS-Redirect")).toBe("/");
  });

  test("the cookie jar is sent on later requests", async () => {
    const app = await createTestApp({ appDir, serverEntry: false });
    await app.post("/redirect-action", {}); // sets flash=saved
    app.cookies.set("session", "abc");
    // The fixture's whoami server action echoes the request's Cookie header.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("lib/whoami.server.ts#whoami"),
    );
    const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    const res = await app.fetch(`/_action?id=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BractJS-Action": "1" },
      body: JSON.stringify(["probe"]),
    });
    expect(await res.json()).toEqual({ label: "probe", cookie: "flash=saved; session=abc" });
  });
});

describe("callLoader / callAction", () => {
  test("callLoader passes request, url, params, typed context and search", async () => {
    const loader = (args: LoaderArgs) => ({
      id: args.params.id,
      path: args.url.pathname,
      user: args.context.user,
      page: args.search.page,
      method: args.request.method,
    });
    expect(
      callLoader(loader, {
        params: { id: "7" },
        url: "http://localhost/posts/7",
        context: { user: "ada" },
        search: { page: 2 },
      }),
    ).toEqual({ id: "7", path: "/posts/7", user: "ada", page: 2, method: "GET" });
  });

  test("a thrown redirect or HttpError propagates", async () => {
    const toLogin = async () => {
      throw redirect("/login");
    };
    const missing = async () => {
      throw new HttpError(404, "nope");
    };
    await expect(callLoader(toLogin)).rejects.toBeInstanceOf(Response);
    await expect(callLoader(missing)).rejects.toBeInstanceOf(HttpError);
  });

  test("callAction posts formData from a plain object", async () => {
    const action = async ({ formData, request }: ActionArgs) => ({
      title: formData.get("title"),
      method: request.method,
      body: (await request.formData()).get("title"),
    });
    expect(await callAction(action, { formData: { title: "Hi" } })).toEqual({
      title: "Hi",
      method: "POST",
      body: "Hi",
    });
  });
});
