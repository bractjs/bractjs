import { afterEach, describe, expect, test } from "bun:test";
import { commitWithTransition } from "../client/view-transition.ts";

const g = globalThis as { document?: unknown };
const realDocument = g.document;
afterEach(() => {
  g.document = realDocument;
});

describe("commitWithTransition", () => {
  test("runs the update synchronously inside document.startViewTransition", () => {
    const events: string[] = [];
    g.document = {
      startViewTransition(cb: () => void) {
        events.push("start");
        cb();
        // The browser takes the "new" snapshot when the callback returns.
        events.push("snapshot");
      },
    };
    commitWithTransition(true, () => events.push("update"));
    expect(events).toEqual(["start", "update", "snapshot"]);
  });

  test("without the flag, never starts a View Transition", async () => {
    let started = false;
    g.document = {
      startViewTransition() {
        started = true;
      },
    };
    let updated = false;
    commitWithTransition(false, () => {
      updated = true;
    });
    expect(started).toBe(false);
    expect(updated).toBe(true);
  });

  test("falls back to a plain transition where the API is missing", () => {
    g.document = {};
    let updated = false;
    commitWithTransition(true, () => {
      updated = true;
    });
    expect(updated).toBe(true);
  });
});
