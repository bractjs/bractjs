# Contributing to BractJS

BractJS is a **pnpm workspace monorepo**. The framework lives in
[`packages/core`](packages/core) and is published as `@bractjs/bractjs`. Example
apps live in [`examples/*`](examples) and are linked to the framework via
`workspace:*`.

**pnpm** manages dependencies; **Bun** is the runtime, test runner, and bundler.
You need both installed:

- [Bun](https://bun.sh) (the framework runs on it — there is no Node.js runtime path)
- [pnpm](https://pnpm.io) 9+ (`corepack enable pnpm` works if you have Node 16.13+)

## Setup

```sh
git clone https://github.com/bractjs/bractjs.git
cd bractjs
pnpm install        # installs the whole workspace and links examples to packages/core
```

## Repository layout

```
packages/core/      # the @bractjs/bractjs framework (src, bin, types, templates) — the only published package
examples/todo/      # demo apps; workspace packages, dep "@bractjs/bractjs": "workspace:*"
examples/cms/
e2e/                # browser end-to-end tests (Playwright) against examples/todo
app/                # the framework's default app-dir stub (app/root.tsx)
```

## Common commands

Run from the repo root:

```sh
pnpm test                                   # run the core test suite (bun test, via --filter)
pnpm e2e                                    # browser end-to-end tests (needs Google Chrome installed)
pnpm --filter @bractjs/bractjs typecheck    # tsc --noEmit on the framework
pnpm --filter @bractjs/bractjs build        # bundle the framework
```

Work on an example app:

```sh
cd examples/todo
pnpm dev            # bractjs dev — runs the workspace-linked CLI; HMR on the port in bractjs.config.ts
pnpm build          # bractjs build
pnpm start          # bractjs start
pnpm compile        # single-binary build (bun build --compile)
```

Changes to `packages/core` are picked up by the examples immediately — they
resolve `@bractjs/bractjs` through the pnpm workspace symlink, so there is no
rebuild/relink step.

## Tests

`pnpm test` runs `bun test` over `packages/core/src/__tests__`. Two tests guard
the single-binary path and must keep passing:
`packages/core/src/__tests__/compile-safety.test.ts` (fast static scan) and
`packages/core/src/__tests__/compile-smoke.test.ts` (compiles and boots a real
binary). See the contributor note in the README's single-binary section for the
constraints these enforce.

`pnpm e2e` runs the Playwright suite in `e2e/` against a production build of
`examples/todo` (`pnpm build && pnpm start` on port 3000) in your installed
Google Chrome — no browser download. It covers what unit tests can't see:
hydration, soft navigation, forms, error pages and styles. Every test fails on
a browser console error. Locally it reuses a todo server already running on
:3000, so stop `pnpm dev` there first if you want the production build tested.

## The `bun-plugin-tailwind>bun` override

`bun-plugin-tailwind` declares the npm `bun` package as a peer dependency, and
pnpm auto-installs peers — which put a second, older Bun (`bun@1.3.14`) into
each Tailwind example's `node_modules/.bin`. `pnpm dev` / `build` / `start` then
ran the examples on that Bun instead of the pinned one. The root
`pnpm.overrides` entry `"bun-plugin-tailwind>bun": "-"` removes it; the plugin
only needs the Bun it's running in. If an example ever reports the wrong
version (`cd examples/cms && pnpm exec bun --version`), delete `node_modules`
and reinstall — pnpm doesn't prune an existing `.bin/bun` link.

## TypeScript versions (why there are two)

`packages/core` and both examples pin **TypeScript 7** — that's what `tsc`,
`pnpm typecheck`, and `bun run typegen` use. The **root** workspace pins
**TypeScript 5.9.3**, and only the lint toolchain sees it.

The reason is that TypeScript 7 is the native Go port: it ships a compiler, not
a compiler _API_, so `ts.ModuleKind`, `ts.sys` and the rest are absent.
`typescript-eslint` is built on that API and crashes on startup without it, and
no release supports TS 7 yet. Since `typescript` is a peer dependency resolved
from the importing package, giving the root a TS 5 satisfies ESLint while
leaving every package that actually runs `tsc` on TS 7.

ESLint itself is pinned to **9.x**: `eslint-plugin-react` and
`eslint-plugin-jsx-a11y` both cap at ESLint 9 and crash on ESLint 10's removed
rule-context API.

Revisit both pins once `typescript-eslint` supports TypeScript 7.

## Releasing `@bractjs/bractjs`

> The full step-by-step release guide (GitHub PR flow, tagging rules, npm
> publish, verification, troubleshooting) lives in
> [PUBLISH_GUIDE.md](PUBLISH_GUIDE.md). The short version follows.

The framework is the **only** published package, from `packages/core/`. The
repo root is `"private": true` and cannot be published (this is intentional — it
prevents publishing the workspace by accident).

**Releases publish from CI.** Pushing a `v*` tag runs
`.github/workflows/release.yml`:

1. **verify**: the tag, `packages/core/package.json` and the newest CHANGELOG
   heading must agree. It then runs the typecheck, the generated-types check,
   the tests (compile-smoke required) and the tarball gate.
2. **publish**: `npm publish --provenance` through npm trusted publishing
   (OIDC). No npm token or OTP exists anywhere. npm trusts this workflow, in
   this repo, under the `npm` environment. It is skipped when the version is
   already on npm.
3. **draft**: drafts the GitHub Release from the CHANGELOG section for a
   human to publish.

```sh
# 1. Move [Unreleased] notes under the new version heading in CHANGELOG.md, then:
cd packages/core
npm version minor --no-git-tag-version   # or patch / major
cd ../..
pnpm test

# 2. Commit through a PR, merge, then tag the merge commit
git tag v0.7.0 && git push origin v0.7.0
```

One-time setup on npmjs.com (package settings → **Trusted publishing**): add a
GitHub Actions publisher for `bractjs/bractjs`, workflow `release.yml`,
environment `npm`. Optionally add required reviewers to the `npm` environment
in the GitHub repo settings, so each publish waits for an approval. A manual
`npm publish` from `packages/core` still works as a fallback; the workflow
then skips publishing and only drafts the release.

Update [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` as part of any
user-facing change, and move those notes under the new version heading at
release time.
