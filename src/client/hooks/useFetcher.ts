import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type FetcherState = "idle" | "loading" | "submitting";

interface SubmitOptions {
  method: string;
  body: FormData | Record<string, string>;
}

interface FetcherResult {
  data: unknown;
  state: FetcherState;
  load(path: string): Promise<void>;
  submit(path: string, opts: SubmitOptions): Promise<void>;
}

interface StreamFetcherResult<T = unknown> {
  events: AsyncGenerator<T>;
  connect(actionId: string): AsyncGenerator<T>;
}

// ── SSE async generator ────────────────────────────────────────────────────

async function* sseStream<T>(actionId: string): AsyncGenerator<T> {
  const res = await fetch(`/_stream?id=${encodeURIComponent(actionId)}`);
  if (!res.ok || !res.body) {
    throw new Error(`[bractjs] /_stream ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.trim().split("\n");
        let event = "data";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (event === "done") return;
        if (event === "error") throw new Error((JSON.parse(data) as { message: string }).message);
        if (event === "data" && data) yield JSON.parse(data) as T;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useFetcher(): FetcherResult;
export function useFetcher<T>(opts: { stream: true }): StreamFetcherResult<T>;
export function useFetcher<T>(opts?: { stream?: boolean }): FetcherResult | StreamFetcherResult<T> {
  if (opts?.stream) {
    return {
      events: (null as unknown) as AsyncGenerator<T>,
      connect(actionId: string): AsyncGenerator<T> {
        return sseStream<T>(actionId);
      },
    } satisfies StreamFetcherResult<T>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [data, setData] = useState<unknown>(undefined);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [state, setState] = useState<FetcherState>("idle");

  async function load(path: string): Promise<void> {
    setState("loading");
    try {
      const res = await fetch(`/_data?path=${encodeURIComponent(path)}`);
      const json = (await res.json()) as { route?: unknown };
      setData(json.route);
    } finally {
      setState("idle");
    }
  }

  async function submit(path: string, submitOpts: SubmitOptions): Promise<void> {
    setState("submitting");
    try {
      const body =
        submitOpts.body instanceof FormData
          ? submitOpts.body
          : new URLSearchParams(submitOpts.body as Record<string, string>);
      const res = await fetch(path, { method: submitOpts.method, body });
      setData(await res.json());
    } finally {
      setState("idle");
    }
  }

  return { data, state, load, submit };
}
