export function isDev(): boolean {
  return Bun.env.NODE_ENV !== "production";
}

export function requireEnv(key: string): string {
  const value = Bun.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function safeStringify(data: unknown): string {
  const seen = new WeakSet();
  const json = JSON.stringify(data, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
  // Escape HTML-sensitive characters so this JSON is safe to embed inside a
  // <script> tag.  \u003c / \u003e / \u0026 are valid JSON unicode escapes —
  // JSON.parse on the client decodes them transparently.
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
