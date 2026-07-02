import { defineConfig } from "@bractjs/bractjs";

// `defineConfig` gives autocomplete + type-checking without annotating the full
// type, and merges over BractJS defaults. The build manifest is injected at
// runtime — never set it here.
export default defineConfig({
  port: 3200,
  clientEnv: [],
});
