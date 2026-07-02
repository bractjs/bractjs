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
app/                # the framework's default app-dir stub (app/root.tsx)
```

## Common commands

Run from the repo root:

```sh
pnpm test                                   # run the core test suite (bun test, via --filter)
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

> **Note:** `bunx tsc` may rewrite `pnpm-lock.yaml` as a side effect (it triggers
> a Bun dependency resolve). If a typecheck leaves the lockfile dirty,
> `git checkout pnpm-lock.yaml` to restore it.

## Releasing `@bractjs/bractjs`

The framework is the **only** published package; publish it from
`packages/core/`. The repo root is `"private": true` and cannot be published
(this is intentional — it prevents publishing the workspace by accident).

```sh
# 1. From the repo root — make sure the workspace is green
pnpm install
pnpm test

# 2. Bump the version (edits packages/core/package.json and creates a git tag)
cd packages/core
npm version patch        # or: minor / major

# 3. (Recommended) confirm the tarball contents before publishing
npm publish --dry-run    # expect files: src, bin, types, templates, LICENSE (+ package.json, README.md)

# 4. Publish
npm publish              # publishConfig.access is already "public"
```

Notes:

- `packages/core` has **no `workspace:*` dependencies** (only `react`/`react-dom`
  peer deps), so nothing needs version-rewriting at publish time. Either
  `npm publish` or `pnpm publish` works; `npm publish` matches the pre-monorepo
  flow most closely.
- One-liner alternative from the repo root:
  `pnpm --filter @bractjs/bractjs publish`.
- The published package shape (name, `exports`, `types`, the `bractjs` CLI bin)
  is unchanged by the monorepo conversion, so consumers are unaffected.

Update [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` as part of any
user-facing change, and move those notes under the new version heading at
release time.
