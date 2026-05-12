export function redirect(url: string, status: number = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

export function json<T>(data: T, init?: ResponseInit): Response {
  const body = JSON.stringify(data);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function error(message: string, status: number = 500): Response {
  return json({ error: message }, { status });
}
