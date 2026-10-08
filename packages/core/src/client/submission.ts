// Normalize React Router-style submissions — `submit(target, options)` from
// `useSubmit()` and `fetcher.submit(target, options)` — into the
// url/method/body triple BractJS's fetch paths take.

/** What `useSubmit()` / `fetcher.submit()` accept as the thing to submit. */
export type SubmitTarget =
  | HTMLFormElement
  | HTMLButtonElement
  | HTMLInputElement
  | FormData
  | URLSearchParams
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export type SubmitEncType =
  "application/x-www-form-urlencoded" | "multipart/form-data" | "application/json" | "text/plain";

/** React Router submit options (the subset BractJS acts on; the rest are accepted and ignored). */
export interface SubmitOptions {
  /** URL to submit to. Default: the current URL (pathname + search). */
  action?: string;
  /** Default: the form's `method`, else `"get"`. */
  method?: string;
  /** Default: the form's `enctype`, else urlencoded (`multipart` for FormData). */
  encType?: SubmitEncType;
  /** `false` submits through a fetcher (no navigation, no history entry). */
  navigate?: boolean;
  /** With `navigate: false`: the fetcher key to report progress under. */
  fetcherKey?: string;
  /** GET submissions: replace the current history entry. */
  replace?: boolean;
  /** GET submissions: history state. */
  state?: unknown;
  /** Passed to routes' `shouldRevalidate` after the mutation (routes without one follow it). */
  defaultShouldRevalidate?: boolean;
  /** Accepted for React Router compatibility; no effect. */
  preventScrollReset?: boolean;
  /** How a relative `action` resolves: against the calling component's route (default) or the URL's path segments. */
  relative?: "route" | "path";
  /** Accepted for React Router compatibility; no effect. */
  flushSync?: boolean;
  /** Animate the resulting page update with the View Transitions API (ignored where unsupported). */
  viewTransition?: boolean;
}

export interface NormalizedSubmission {
  /** Target URL — for GET, with the serialized fields as its query string. */
  url: string;
  /** Uppercase HTTP method. */
  method: string;
  /** Request body (null for GET). */
  body: FormData | URLSearchParams | string | null;
  /** Explicit Content-Type for string bodies (JSON / text). */
  contentType?: string;
  /** Form fields for optimistic UI, when the payload is form-shaped. */
  formData?: FormData;
  /** The parsed JSON payload, for `encType: "application/json"`. */
  json?: unknown;
  /** The raw text payload, for `encType: "text/plain"`. */
  text?: string;
}

function isElement(v: unknown, tag: string): v is HTMLElement {
  return typeof HTMLElement !== "undefined" && v instanceof HTMLElement && v.tagName === tag;
}

function currentUrl(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
}

function toFormData(params: URLSearchParams): FormData {
  const fd = new FormData();
  params.forEach((v, k) => fd.append(k, v));
  return fd;
}

function objectToSearchParams(obj: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) params.append(k, String(item));
    else params.append(k, String(v));
  }
  return params;
}

/**
 * Turn any React Router submit target + options into a concrete request.
 * `resolveAction` resolves whichever action applies — `options.action`, the
 * submitter's `formaction` or the form's `action` — relative to the caller's
 * route (hooks pass `useResolveTo()`); without one, the current URL is used.
 */
export function normalizeSubmission(
  target: SubmitTarget,
  options: SubmitOptions = {},
  resolveAction?: (action: string) => string,
): NormalizedSubmission {
  let action = options.action;
  let method = options.method;
  let encType = options.encType;
  let formData: FormData | undefined;
  let params: URLSearchParams | undefined;
  let raw: unknown;

  if (isElement(target, "FORM")) {
    const form = target as HTMLFormElement;
    action ??= form.getAttribute("action") ?? undefined;
    method ??= form.getAttribute("method") ?? undefined;
    encType ??= (form.getAttribute("enctype") as SubmitEncType | null) ?? undefined;
    formData = new FormData(form);
  } else if (isElement(target, "BUTTON") || isElement(target, "INPUT")) {
    const el = target as unknown as HTMLButtonElement | HTMLInputElement;
    const form = el.form;
    if (!form) throw new Error("[bractjs] submit(): a submitter button/input must be inside a <form>.");
    action ??= el.getAttribute("formaction") ?? form.getAttribute("action") ?? undefined;
    method ??= el.getAttribute("formmethod") ?? form.getAttribute("method") ?? undefined;
    encType ??=
      (el.getAttribute("formenctype") as SubmitEncType | null) ??
      (form.getAttribute("enctype") as SubmitEncType | null) ??
      undefined;
    formData = new FormData(form, el);
  } else if (target instanceof FormData) {
    formData = target;
  } else if (target instanceof URLSearchParams) {
    params = target;
  } else {
    raw = target;
  }

  const upper = (method ?? "get").toUpperCase();
  const base = action !== undefined ? (resolveAction ? resolveAction(action) : action) : currentUrl();

  // JSON / text payloads (React Router `encType`), never for GET.
  if (upper !== "GET" && encType === "application/json" && raw !== undefined) {
    return {
      url: base,
      method: upper,
      body: JSON.stringify(raw),
      contentType: "application/json",
      json: raw,
    };
  }
  if (upper !== "GET" && encType === "text/plain" && raw !== undefined) {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    return { url: base, method: upper, body: text, contentType: "text/plain;charset=UTF-8", text };
  }

  // Form-shaped payloads.
  if (raw !== undefined && raw !== null) {
    if (typeof raw === "object" && !Array.isArray(raw))
      params = objectToSearchParams(raw as Record<string, unknown>);
    else
      throw new Error(
        '[bractjs] submit(): pass an object, FormData, or a form — or use encType "application/json".',
      );
  }

  if (upper === "GET") {
    const query = params ?? new URLSearchParams();
    if (formData) {
      formData.forEach((v, k) => {
        if (typeof v === "string") query.append(k, v);
      });
    }
    const [path] = base.split("?");
    const qs = query.toString();
    return { url: qs ? `${path}?${qs}` : path, method: upper, body: null };
  }

  if (formData) {
    // urlencoded unless the form asked for multipart (files need multipart).
    const hasFile = [...formData.values()].some((v) => typeof v !== "string");
    const body =
      encType === "multipart/form-data" || hasFile || encType === undefined
        ? formData
        : new URLSearchParams([...formData.entries()] as Array<[string, string]>);
    return { url: base, method: upper, body, formData };
  }
  const p = params ?? new URLSearchParams();
  return {
    url: base,
    method: upper,
    body: encType === "multipart/form-data" ? toFormData(p) : p,
    formData: toFormData(p),
  };
}
