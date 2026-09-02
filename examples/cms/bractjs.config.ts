import { defineConfig } from "@bractjs/bractjs";

// `defineConfig` gives autocomplete + type-checking without annotating the full
// type, and merges over BractJS defaults. The build manifest is injected at
// runtime — never set it here.
export default defineConfig({
  port: 3200,
  clientEnv: [],
  // Compiles app/styles.css (imported from root.tsx) as part of the bundle:
  // no tailwindcss CLI step, no hand-written <link>. BractJS extracts the CSS,
  // content-hashes it, and emits the stylesheet link during SSR.
  tailwind: true,
});
