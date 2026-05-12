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

// ── Hook ───────────────────────────────────────────────────────────────────

export function useFetcher(): FetcherResult {
  const [data, setData] = useState<unknown>(undefined);
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

  async function submit(path: string, opts: SubmitOptions): Promise<void> {
    setState("submitting");
    try {
      const body =
        opts.body instanceof FormData
          ? opts.body
          : new URLSearchParams(opts.body as Record<string, string>);
      const res = await fetch(path, { method: opts.method, body });
      setData(await res.json());
    } finally {
      setState("idle");
    }
  }

  return { data, state, load, submit };
}
