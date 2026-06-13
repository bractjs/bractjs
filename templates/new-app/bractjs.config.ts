import { defineConfig } from "@bractjs/bractjs";

// All fields are optional and merged over BractJS defaults. `defineConfig`
// gives you autocomplete + type-checking without annotating the full type.
// (The build manifest is injected at runtime — you never set it here.)
export default defineConfig({
  port: 3000,
  clientEnv: [], // process.env keys to expose to the client bundle
});
