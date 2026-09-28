import { defineConfig } from "@bractjs/bractjs";

export default defineConfig({
  port: Number(process.env.PORT ?? 4101),
});
