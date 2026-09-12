# RC-ENG-4.4 — Dependency wave (the 2026-09 dependabot set)

Run journal for the implement pass on `dispatch/dndtools/a127e092d50a35118a0a`, based on `5e6064d9`.

## Baseline (before any bump)

- Node 22.22.3, pnpm 10.34.5, JDK 21 at `/usr/lib/jvm/java-21-openjdk`, Android SDK at `~/Android`.
- Unscoped `pnpm audit` (pnpm 11.4.0): 6 advisories, 2 low and 4 moderate.
  - `vitest` / `@vitest/mocker` < 4.1.11 (moderate ×2): root, `packages/core`, `@vitest/coverage-v8`.
  - `joi` < 18.2.5 (low ×2), through `apps/gm-react > wait-on`.
  - `react-router` < 7.18.0 (moderate ×2), through `apps/gm-react > react-router-dom@6`.
- Every target version is older than the one-day `minimumReleaseAge`, so none of them is held back.

## Plan

One commit per bump, in the story's order, with the gate between them. A bump that breaks a gate
is reverted and the reason is recorded here.

## Log

### 1. vite 7.3.6 → 8.2.2 with `@vitejs/plugin-react` 4.7.0 → 6.1.1 (#60, #63)

- `vite.config.ts` took `OutputBundle` from `rollup`, which vite 8 no longer installs. Nothing
  caught it because the app tsconfig only includes `src`. The type now comes from vite's
  `Rolldown` namespace.
- `build.rollupOptions.output.manualChunks` became `build.rolldownOptions.output.codeSplitting`
  with one `name: appManualChunk` group. Rolldown's own typings describe exactly that conversion
  for the deprecated function form, so the chunking is unchanged: `vendor-react`,
  `vendor-storage`, `vendor-auth` and `processing-core` still come out as separate chunks.
- Gate: `gates`, `format:check:changed`, `typecheck`, `lint` (0 errors, the 15 existing
  warnings), core 272 files / 4769 tests, app 121 / 1272, cloud 36 / 482, tooling 24 / 162,
  `build`, `check:bundle-budget` (core 647.9 KiB gzipped, pass) and `feature-audit` all pass.
  I also typechecked `vite.config.ts` on its own with `tsc --ignoreConfig --strict`.
- Browser acceptance: the first full run was killed at 341/1080 (0 failed) when the session
  ended, so I reran it as four `--shard=n/4` runs, each on its own free `DNDTOOLS_E2E_PORT` with
  `--workers=2 --retries=2`. Result: 266 + 268 + 268 + 267 = 1069 passed, 11 skipped, 0 failed,
  0 flaky. Committed as `9e203c63`.

### 2. GitHub Actions group (#57)

- Applied PR #57's workflow diff unchanged. I checked each new SHA against its release tag
  through the GitHub API: checkout v7.0.1, pnpm/action-setup v6.0.10, setup-node v7.0.0,
  setup-java v6.0.0, configure-aws-credentials v6.2.4 and sbom-action v0.24.2 all match.
- setup-node 7 and setup-java 6 are the only majors. Their release notes list no input changes
  these workflows use.
- Gate: tooling tests (including `ci-guardrails`), `gates` and Prettier on the eight workflows
  pass. No code changed, so the other gates' path filters don't apply. Whether the workflows
  run on GitHub is only proven by the CI run after delivery.

### 3. Gradle wrapper 8.14.3 → 9.7.1 (#56): reverted, not committed

- This machine has no JDK 21. `/usr/lib/jvm/java-21-openjdk` is an empty directory, and the
  installed 25 and 26 are headless builds without `javac`. So I downloaded Eclipse Temurin
  21.0.12.1 into the run directory, matching CI's `java-version: '21'`.
- I ran `cap sync android`, then `./gradlew --no-daemon --stacktrace assembleDebug`, with the
  wrapper at 9.7.1. It fails while configuring `:app`:

  > Plugin 'com.android.internal.application' relies on
  > 'org.gradle.api.problems.internal.InternalProblems', a Gradle internal API that was removed in
  > Gradle 9.6.0. Update the plugin to a version that no longer uses Gradle internal APIs, or use
  > Gradle 9.5.

- That's the same failure that took down release v0.3.4 (see `CHANGELOG.md` 0.3.5 and the
  `dependabot.yml` ignore rule for `gradle >=9.6`). AGP is 8.13.0 in `android/build.gradle`,
  which this story doesn't own. The wrapper stays at 8.14.3, the version the last green `main`
  CI run built with.
- Follow-up needed: AGP 9 and Gradle 9.7 have to move in one story that owns
  `apps/gm-react/android/build.gradle` and the wrapper, and `.github/dependabot.yml` must lift the
  ignore rule at the same time. Why dependabot opened #56 despite that rule is worth checking
  there too, since the PR predates nothing obvious.
- `cap sync` rewrote the tracked `android/capacitor.settings.gradle`. The committed copy still
  points at Capacitor 8.4.2 store paths, while the lockfile has 8.5.0. I restored it; CI
  regenerates it on every sync anyway.

### 4. electron 43.1.0 → 44 (#62)

- `^44.1.1` resolves to 44.3.0, the newest 44.x that the one-day release-age rule allows. For the
  same reason, step 1's `^8.2.2` locked vite at 8.3.0, not 8.2.2.
- Electron 44's breaking changes miss this shell. It uses no renderer `clipboard` and no
  `setLoginItemSettings`. Its one `net.fetch` isn't a document or frame request, so the
  `Sec-Fetch-Dest` rule doesn't apply. `electron-builder.yml` targets only x64 and arm64, so the
  dropped 32-bit builds don't matter.
- Gate: `gates`, `format:check:changed`, `typecheck`, `lint` (0 errors), app tests 121 / 1272,
  tooling tests 24 / 162, `build` and `feature-audit` pass.
- Boot test on a real display, with the 44.3.0 binary fetched by `scripts/ensure-electron.mjs`:
  - `desktop:smoke` passes. It covered the secure `dndtools://app` origin, the CORS probe,
    persistence, the crash-safe file-origin migration and auto-update, with no console errors.
  - `desktop:smoke:updater` passes 12 of 12 checks.
- Browser acceptance: not rerun for this commit. Nothing under `apps/gm-react/src` imports
  `electron`; only `electron/*.cjs` and one tooling test do. So the Chromium suite runs the same
  bundle as step 1's. The full suite runs again on the React commits and on the final merged set.
- Committed as `5eff0d8f`.

### 5. `@types/node` → 26 in `packages/core` (was ^24.12.4) and `packages/cloud-fns` (was ^22.10.0) (#59)

- pnpm wrote `^26.5.1`, the newest 26.x the release-age rule allows. That satisfies #59's
  `^26.4.0`. The lockfile keeps `@types/node@24.12.4` only because electron depends on it.
- The expected typecheck fallout didn't happen: `pnpm typecheck` passes for core, cloud-fns and
  gm-react with no source changes.
- Gate: `gates`, `format:check:changed`, `lint` (0 errors), core tests 272 / 4769, cloud 36 / 482,
  tooling 24 / 162, `build` (includes the cloud-fns esbuild bundle) and `feature-audit` pass.
  Browser acceptance's path filter is `apps/gm-react/*`, which this commit doesn't touch, and
  `@types` packages are compile-time only.
- Committed as `514ef6e8`.

### 6. react-dom + `@types/react-dom` 18 → 19 (#61): reverted, not committed

- #61 bumps react-dom alone. react-dom 19 has a peer dependency of `react: ^19.2.8`, and
  `@types/react-dom` 19 needs `@types/react ^19.2.0`. So I moved all four together: react,
  react-dom, `@types/react` and `@types/react-dom`, which all resolved to 19.3.0.
- Typecheck fails with one error:
  `src/screens/settings/index.tsx(63,38): error TS2503: Cannot find namespace 'JSX'`. That file
  types its sub-page map as `() => JSX.Element`, and `@types/react` 19 no longer declares the
  global `JSX` namespace. The fix is one line (`React.JSX.Element`, or `ReactElement`), but the
  file is outside both this story's claim and the dispatcher's companion paths, so the candidate
  would be rejected.
- For the follow-up's scope I also ran the other gates on React 19 before reverting:
  - App tests: 1 of 1272 fails. `src/ds/components/data/Figure.test.tsx` expects the markup to
    start with `<figure`, but React 19's `renderToStaticMarkup` now emits
    `<link rel="preload" as="image" href="/cover.png"/>` first. The test file is a companion path,
    so the assertion can be fixed alongside.
  - `build` and `check-prod-bundle` pass. `vendor-react` grows from 53.38 to 76.19 KiB gzipped,
    and `check:bundle-budget` puts the core bundle at 670.0 KiB (it was 647.9), still a pass.
  - I didn't run browser acceptance, since the bump was being reverted either way.
- Reverted `apps/gm-react/package.json` and `pnpm-lock.yaml`, then reinstalled with
  `--frozen-lockfile`. React is back on 18.3.1.
- Follow-up needed: one story owning `apps/gm-react/package.json`, the lockfile and
  `src/screens/settings/index.tsx`, which fixes the `JSX` reference and the Figure assertion and
  runs the full browser suite. React Router 7 could ship in it, or before it: 7.18 accepts
  `react >=18`.

### 7. Audit: vitest and joi

- vitest (moderate ×2, < 4.1.11): root `vitest` and `@vitest/coverage-v8`, and core's `vitest`,
  now require `^4.1.11`. I kept the major at 4, even though vitest 5.0.0 is out.
- joi (low ×2, < 18.2.5, through `wait-on`): `wait-on` now requires `^9.1.0`. That alone left joi
  locked at 18.2.3, because `^18.2.3` still matched. `pnpm update -r joi` moved it to 18.2.8, the
  newest release the one-day rule allows (18.2.9 is newer than that).
- The unscoped `pnpm audit` (pnpm 11.4.0) now lists 2 advisories, both moderate, both
  `react-router` < 7.18.0 through `react-router-dom@6`.
- Gate: `gates`, `format:check:changed`, `typecheck`, `lint` (0 errors), core 272 / 4769 on
  vitest 4.1.11, `test:coverage:core` (89.75% statements), app 121 / 1272, cloud 36 / 482,
  tooling 24 / 162, `build`, `check:bundle-budget` (647.9 KiB, pass) and `feature-audit` all pass.
  `wait-on` only runs in `desktop:dev`, and Playwright doesn't use vitest. The full browser suite
  runs on the next commit and on the final merged set.
