/**
 * @bractjs/bractjs/testing — helpers for testing BractJS apps with `bun test`.
 *
 * `createTestApp()` runs the app's real request pipeline in-process (global
 * and route middleware, beforeLoad, loaders, actions, SSR) from source, with no
 * build and no server. `callLoader()` / `callAction()` call one route function
 * with the arguments BractJS would pass. See docs/testing.md.
 */
export type {
  CallActionOptions,
  CallLoaderOptions,
  FormBody,
  TestApp,
  TestAppOptions,
} from "./testing/index.ts";
export { callAction, callLoader, createTestApp } from "./testing/index.ts";
