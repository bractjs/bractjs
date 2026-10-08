// getClientAddress(request) keeps working on the requests the framework
// derives: the parsed-form proxy an action receives, and the /_data target
// request loaders and gates receive on a soft navigation. The address is keyed
// by object identity, so both used to answer undefined.
import { describe, expect, test } from "bun:test";
import { getClientAddress, setClientAddress } from "../server/client-address.ts";
import { buildTrie } from "../server/matcher.ts";
import { handleRequest } from "../server/request-handler.ts";
import { pathToSegments } from "../server/scanner.ts";
import type { ActionArgs, LoaderArgs } from "../shared/route-types.ts";

const seen: Record<string, string | undefined> = {};
const moduleRegistry = {
  "routes/login.tsx": {
    loader: ({ request }: LoaderArgs) => {
      seen.loader = getClientAddress(request);
      return { ok: true };
    },
    action: async ({ request }: ActionArgs) => {
      seen.action = getClientAddress(request);
      seen.field = String((await request.formData()).get("user"));
      return { ok: true };
    },
    default: () => null,
  },
};
const trie = buildTrie([
  { filePath: "routes/login.tsx", urlPattern: "login", segments: pathToSegments("login") },
]);
const config = {
  appDir: "/nonexistent",
  publicDir: "/nonexistent",
  manifest: { clientEntry: "/c.js", routes: {} },
  moduleRegistry,
};

describe("client address on derived requests", () => {
  test("an action's (parsed-form) request still has the socket address", async () => {
    const req = new Request("http://x/login", {
      method: "POST",
      headers: { Origin: "http://x", "X-BractJS-Action": "1" },
      body: new URLSearchParams({ user: "ada" }),
    });
    setClientAddress(req, "203.0.113.7");
    const res = await handleRequest(req, trie, config, {});
    expect(res.status).toBe(200);
    expect(seen.field).toBe("ada");
    expect(seen.action).toBe("203.0.113.7");
  });

  test("a soft navigation's loader (/_data target request) has it too", async () => {
    const req = new Request("http://x/_data?path=/login");
    setClientAddress(req, "198.51.100.4");
    const res = await handleRequest(req, trie, config, {});
    expect(res.status).toBe(200);
    expect(seen.loader).toBe("198.51.100.4");
  });
});
