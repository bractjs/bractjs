import type { BractJSConfig } from "bractjs";

const config: BractJSConfig = {
  port: 3000,
  appDir: "./app",
  publicDir: "./public",
  buildDir: "./build",
  manifest: { clientEntry: "", routes: {} }, // populated by `bractjs build`
  minify: true,
  sourcemap: "external",
  clientEnv: [],
};

export default config;
