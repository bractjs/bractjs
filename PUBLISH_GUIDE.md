# Publishing BractJS — npm + GitHub

Step-by-step release guide for this repo. The examples use `0.3.0`; substitute your version.

**What publishes:** only `@bractjs/bractjs`, from [`packages/core/`](packages/core/). The repo root is `"private": true` and must never be published. The package ships **raw TypeScript** (no `dist/` build step) — the tarball is the `files` allowlist: `src` (minus `src/__tests__`), `bin`, `types`, `templates`, `LICENSE`, plus `package.json` and `README.md`.

**Built-in guards** (they run for you — don't bypass them):

- `prepublishOnly` runs [`scripts/verify-pack.ts`](packages/core/scripts/verify-pack.ts) on every real `npm publish`: it fails the publish if LICENSE/README/types/templates are missing from the tarball, or if tests/generated files leak in.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) gates every push/PR: Biome, workspace typecheck, lockfile drift, full test suite (compile-smoke required), and an npm-pack dry run.
- `compile-safety.test.ts` + `compile-smoke.test.ts` prove the single-binary path still works — they are part of `pnpm test`.

> Tip: the `/release` slash command (`.claude/commands/release.md`) automates steps 3–7 interactively.

---

## 0. One-time setup

Skip anything you've already done.

```sh
# npm — you need publish rights on the @bractjs scope (npm org or user "bractjs")
npm login                          # follow the browser/OTP flow
npm whoami                         # confirm you're logged in
npm access list packages           # confirm @bractjs/bractjs (or the scope) is listed

# GitHub — the remote is already configured (https://github.com/bractjs/bractjs.git)
gh auth login                      # if the gh CLI isn't authenticated yet
git remote -v                      # should show origin → github.com/bractjs/bractjs
```

Enable **2FA** on your npm account — npm prompts for an OTP at publish time.

---

## 1. Land the release code on `main` (GitHub first)

Releases are cut from `main` after CI has proven the exact code you'll publish.

```sh
# From your feature branch (e.g. refactor/mono-repo)
git status                         # working tree must be clean
git push -u origin <branch>

gh pr create --base main --title "..." --body "..."
gh pr checks --watch               # wait for the CI workflow to go green
gh pr merge --squash               # or --merge, per repo convention

git checkout main && git pull
```

> First push of a long-lived branch? CI has never run on GitHub before this repo's workflow was added — expect the first run to be the slowest (cold caches).

## 2. Preflight on `main`

```sh
pnpm install                       # sync the workspace
pnpm test                          # full suite incl. compile-smoke (stop dev servers on :3000/:3200 first)
pnpm -r typecheck                  # framework + hand-written .d.ts + examples
pnpm lint                          # biome check .
git status                         # must still be clean
```

All four must be green. If `pnpm test` reports port-bind errors, check for leftover dev servers: `lsof -i :3000` / `lsof -i :3200`.

## 3. Move the changelog

Edit [`CHANGELOG.md`](CHANGELOG.md): rename `## [Unreleased]` to the new version with today's date, and add a fresh empty `[Unreleased]` above it:

```markdown
## [Unreleased]

_Nothing yet._

---

## [0.3.0] — 2026-07-02
...everything that was under [Unreleased]...
```

If `[Unreleased]` is empty, there is nothing user-facing to release — stop and reconsider.

## 4. Bump the version

Two equivalent paths — **pick one**, don't mix them:

**A. `npm version` (does the bump + commit + tag in one step):**

```sh
cd packages/core
npm version minor                  # or patch / major — edits package.json, commits, tags v0.3.0
cd ../..
```

**B. Manual bump** (you edited `packages/core/package.json` yourself — e.g. `"version": "0.3.0"` is already set):

```sh
git add packages/core/package.json CHANGELOG.md
git commit -m "release: v0.3.0"
git tag v0.3.0
```

Either way, verify the three agree before continuing: `package.json` version, the newest `CHANGELOG.md` heading, and the tag:

```sh
git tag -l "v0.3*" && grep -m1 '^## \[0' CHANGELOG.md && grep '"version"' packages/core/package.json
```

## 5. Dry-run the tarball

```sh
cd packages/core
npm publish --dry-run              # full file listing
bun run scripts/verify-pack.ts     # the same gate prepublishOnly will run
```

Expect roughly **130 files / ~150 kB**: `src/` (no `__tests__`), `bin/cli.ts`, `types/*.d.ts`, `templates/new-app/`, `LICENSE`, `README.md`. Anything with `__tests__`, `_generated`, or `.env` in it is a bug — verify-pack will refuse.

## 6. Publish to npm

```sh
cd packages/core
npm publish                        # prompts for your 2FA OTP
```

Notes:

- `publishConfig.access: "public"` is already in `package.json` — no `--access public` flag needed for the scoped name.
- `prepublishOnly` (verify-pack) runs automatically; if it fails, **nothing was published** — fix and retry.
- Publish from `packages/core/`, never from the repo root. One-liner alternative from the root: `pnpm --filter @bractjs/bractjs publish`.
- **Publishing is irreversible** in practice: `npm unpublish` is only possible within 72 hours and only if nothing depends on the version. Past that, your options are `npm deprecate` + publishing a fixed patch.

## 7. Push the tag + cut the GitHub Release

```sh
git push origin main
git push origin v0.3.0             # push THIS tag explicitly
```

> **Do not use `git push --tags`.** This repo has historical tags (`v0.2.0`, `v0.2.2`, older `v0.1.x`) that point at a pre-rebase lineage, plus a locally backfilled `v0.2.1`. Blanket-pushing them would publish tags whose commits aren't on `main`. Push release tags one at a time.

Create the release with the changelog section as its notes:

```sh
# Extract this version's changelog section into notes.md (or paste by hand), then:
gh release create v0.3.0 --title "v0.3.0" --notes-file notes.md
# quick alternative: --generate-notes uses the PR titles since the last release
```

## 8. Verify the release

```sh
npm view @bractjs/bractjs version          # should print 0.3.0
npm view @bractjs/bractjs dist.fileCount   # sanity: ~130

# Real-world smoke: scaffold from the registry (outside the repo!)
cd $(mktemp -d)
bunx bractjs@latest new smoke-app
cd smoke-app && bun run dev                # expect the dev server on :3000
```

The scaffold test matters: it exercises the published tarball (`templates/`, the CLI bin, and the raw-TS `exports`) exactly as a new user will.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `402 Payment Required` or `403` on publish | You lack rights on the `@bractjs` scope, or `access` isn't public. `publishConfig` handles access; check `npm whoami` + org membership. |
| `You cannot publish over the previously published versions` | The version already exists on npm. Bump again (`npm version patch`) — you can't reuse a version, even after unpublish. |
| verify-pack fails on missing LICENSE/README | The `files` allowlist in `packages/core/package.json` regressed — restore the entry rather than skipping the gate. |
| `EOTP` | Re-run `npm publish` and enter a fresh 2FA code. |
| Published a broken version | `npm deprecate @bractjs/bractjs@0.3.0 "broken — use 0.3.1"`, fix, publish a patch. Only unpublish (<72h, no dependents) as a last resort. |
| CI red on the release PR | Fix on the branch before tagging — never publish a version whose exact tree CI hasn't passed. |

## Release checklist (TL;DR)

```text
[ ] PR merged to main, CI green
[ ] pnpm test + pnpm -r typecheck + pnpm lint green on main
[ ] CHANGELOG: [Unreleased] → [X.Y.Z] — date (+ fresh empty [Unreleased])
[ ] version bumped, committed, tagged vX.Y.Z (all three agree)
[ ] npm publish --dry-run reviewed (~130 files, no __tests__)
[ ] npm publish (from packages/core, OTP ready)
[ ] git push origin main && git push origin vX.Y.Z   (never --tags)
[ ] gh release create vX.Y.Z with the changelog section
[ ] npm view version + bunx bractjs@latest new smoke test
```
