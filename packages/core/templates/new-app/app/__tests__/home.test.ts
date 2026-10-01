// Tests run the app's real request pipeline in-process — no build, no server.
// `bun test` from the app root. Guide: https://github.com/bractjs/bractjs/blob/main/docs/testing.md
import { expect, test } from "bun:test";
import { callLoader, createTestApp } from "@bractjs/bractjs/testing";
import { loader } from "../routes/_index.tsx";

const app = await createTestApp();

test("the home page renders the loader's message", async () => {
  const res = await app.get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Hello from BractJS!");
});

test("the loader returns the greeting", async () => {
  expect(await callLoader(loader)).toEqual({ message: "Hello from BractJS!" });
});
