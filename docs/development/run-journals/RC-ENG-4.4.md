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

### 8. Resumed implement pass (2026-09-11)

- Preserved commits through `17499c4f`; the only uncommitted changes are the React Router
  6 → 7.18.3 manifest and lockfile update intended to clear the remaining audit advisories.
- Prior React 19 and Gradle 9.7.1 candidates remain reverted. Their failures above are prior-run
  evidence, not new validation. No out-of-scope source or AGP fixes will be forced through.
- Running the local CI mirror, browser acceptance, bundle budget, Android preflight and unscoped
  audit on the preserved candidate before deciding whether to retain it. Raw outputs are kept
  in this run's Headroom artifacts.
- PR closure requires a successfully integrated replacement. This branch is local and promotion
  is reserved to the central operator; rejected bumps cannot truthfully supersede their PRs.

- Resumed checks so far: frozen install exit 0; unscoped `pnpm audit` exit 0, no known
  vulnerabilities (Headroom `ac03a94118fd4dd8bcd72fec049ca877`); Android static preflight exit 0.
- Unit suites: core 272 files / 4769 tests, cloud 36 / 482, app 121 / 1272, tooling 24 / 162,
  all passed. Build and typecheck passed; bundle budget is 653.4 KiB gzipped, pass
  (Headroom `1605c332caff4a76b269b5a4fd5908ca`, full tail retrieved).
- `desktop:smoke` first exited 1 because this worker had no DISPLAY. Reused the built renderer
  and ran `node apps/gm-react/scripts/run-desktop-smoke.mjs` with the local X display configured:
  exit 0, secure origin, CORS, persistence, crash-safe migration and 12 updater checks passed
  (Headroom `e21008ec9ad74c14b3a369e620182676`). No source fix was needed.
- Long checks exceed Headroom's 120-second command limit, so they run in foreground native exec
  sessions with complete logs at `/tmp/rc-eng-4.4-resume-{ci,android,desktop-display}.log`.
  Headroom captures exact relevant log sections; no compressed summary is treated as a pass.
- Coverage: core 4769 tests passed, statement coverage 89.75%, gate passed.
- Android: after `cap sync android`, JDK 21 and the retained Gradle 8.14.3 passed
  `testDebugUnitTest lintDebug assembleDebug bundleDebug` with `--no-daemon --max-workers=2`:
  exit 0, BUILD SUCCESSFUL, 426 tasks executed (Headroom `7dc47155f3c345a79c4b721f4c8b7a3e`).
  This validates native unit/lint/debug packaging, not emulator lifecycle or hosted Actions.
  Restored only the generated `capacitor.settings.gradle` that sync rewrote; it was clean at
  entry and is outside this task's ownership. CI regenerates it before its native gates.

### 9. React Router 7: rejected and reverted after browser regression

- The resumed full browser run failed `tests/e2e/command-palette.spec.ts:251` on desktop,
  including both retries. The assertion at line 262 expected the first accessible group to
  be `On this screen`, but received the board's `Zoom` group. The contextual palette group
  itself was visible; the failure concerns the exposed background group/order, not missing
  contextual actions. Exact trace error retained in Headroom `0d30ec34fb0d41a2a70816feb543599c`.
- Stopped this run's CI process tree after the deterministic failure; the full suite and the
  subsequent standalone axe/report steps did NOT complete. No full-CI pass is claimed.
- Controlled A/B with the same isolated port, desktop profile, one test and no retries:
  - Router 6 restored from `17499c4f`, frozen install, palette test: exit 0 / 1 passed
    (Headroom `20fbd6bb086a403690dd10cc9860e06e`).
  - Restored the preserved Router 7 candidate, frozen install, same test: exit 1 / 1 failed,
    same `Zoom` mismatch (Headroom `64ac275b34f949beb99ee1904b610f74`).
- Reverted the uncommitted Router 7 manifest and lockfile to `17499c4f`, as required by the
  task's failed-bump policy. The earlier clean audit and broad unit/native/desktop results
  in section 8 apply to that rejected candidate, not a final all-green set.
- HANDOFF RC-ENG-4.4 → apps/gm-react/src/app/CommandPalette.tsx and
  apps/gm-react/src/platform/modalIsolation.ts:
  investigate the Router 7 background accessibility regression with the named browser test;
  do not weaken the assertion merely to force the dependency bump through.
- Remaining acceptance blockers: two moderate Router 6 audit advisories; rejected React 19
  and Gradle 9.7.1 migrations need their out-of-scope owners; full final browser/hosted CI and
  operator integration remain pending. No push or dispatcher control-state changes occurred.

## Report from the previous implement pass

PARTIAL RC-ENG-4.4: preserved the five dependency commits through `17499c4f`; rejected and
reverted the Router 7 candidate after a controlled browser regression. React 19 and Gradle
9.7.1 remain rejected as recorded above. No failing bump was forced through.

- Final frozen install: exit 0. Final palette regression spec: desktop and mobile both pass,
  2 / 2, no retries (Headroom `03f02034bdbf4ad19b2bb28f67aceb7e`).
- Final unscoped `pnpm audit`: exit 1, two moderate React Router advisories,
  GHSA-wrjc-x8rr-h8h6 and GHSA-337j-9hxr-rhxg
  (Headroom `d1f090935de5473688669b127b8033b1`). Acceptance is NOT complete.
- The full Router 7 CI run was stopped after the repeated browser failure. Its earlier passing
  unit, coverage, native and desktop checks do not establish an all-green final set.
- PRs #56, #57, #59, #60, #61, #62 and #63 remain open. Closure naming an integrating commit
  remains for the operator after a validated set exists; no unintegrated or rejected bump has
  been represented on GitHub as a successful replacement.
- This continuation changes only development documentation and this journal. Earlier intended
  dependency commits are preserved; the uncommitted rejected Router 7 change is removed.

## 10. Capacity-timeout continuation (2026-09-12)

### Ledger and decisions

- Entry tree was clean at `d35e57d6213b9fc46a9bbf273f8a4c224ed0bd87`. The previous
  verification-capacity timeout is scheduler feedback, not a failed product check and not proof
  of a successful gate. No dispatcher controls were changed or additional agents started.
- Existing commits are preserved: Vite/plugin `d2301af6`, Actions `2f3691d0`, Electron
  `4c05767a`, Node types `11aed244`, and Vitest/Joi `000d4761`. Earlier hashes in this journal
  predate the branch rebase; these are the current branch's corresponding commits.
- Fresh registry query (`pnpm view react-router-dom@6 version --json`) confirms 6.30.6 is the
  newest Router 6 release. The current lockfile already resolves that version. There is no
  newer Router 6 patch to apply within this major.
- Fresh `pnpm audit --json` with the repository-pinned pnpm 10.34.5 exits 1: two moderate
  advisories, GHSA-wrjc-x8rr-h8h6 and GHSA-337j-9hxr-rhxg, both requiring react-router >=7.18.0.
  Exact output: `/tmp/rc-eng-4.4-current-audit.json`. No audit exclusions were added.
- Router 7.18.3 remains the newest stable 7.x version in the registry. It is the same candidate
  already rejected by section 9's controlled browser comparison. Repeating that unchanged
  candidate or suppressing its failing assertion would not resolve the recorded regression.
- React 19 and Gradle 9.7.1 remain rejected under the explicit failed-bump policy. Current
  Android configuration still pairs Gradle 8.14.3 with AGP 8.13.0. Their earlier failure
  diagnostics above are prior-run evidence; these migrations were not retried in this pass.
- HANDOFF RC-ENG-4.4 → apps/gm-react/src/app/CommandPalette.tsx and
  apps/gm-react/src/platform/modalIsolation.ts: resolve the Router 7 accessibility regression
  before retrying the patched router. These source files are outside the task's write fence.
- HANDOFF RC-ENG-4.4 → apps/gm-react/src/screens/settings/index.tsx: migrate the global JSX
  type before retrying React 19, with the Figure rendering assertion described in section 6.
- HANDOFF RC-ENG-4.4 → apps/gm-react/android/build.gradle and .github/dependabot.yml:
  migrate AGP alongside Gradle and lift the incompatible-version ignore only after native gates.
- Acceptance amendment of 2026-09-12 applied: closing PRs #56, #57 and #59–#63 as superseded
  belongs to loop/rc → main delivery after integration. PR closure is not a candidate-review
  criterion. No PRs were closed, and nothing was pushed or promoted.

### Report

PARTIAL RC-ENG-4.4: existing dependency commits preserved; fresh unscoped audit still fails
with two moderate Router advisories. A clean audit requires the out-of-scope Router migration
handoff above. No new dependency bump is retained and no full merged-set gate pass is claimed.
This continuation changes only this journal. `pnpm gates`, `pnpm format:check:changed`, and
`git diff --check` pass (exit 0); the quality registry emits existing file-size target warnings.
These documentation checks do not establish type, unit, browser, native, or hosted CI success.

## 11. App gate failure after integration-base refresh

- Entry tree clean at `bbf3c825fcbbdf7710fbe15de23f4fbd1ed0ba68`. Read the original failed
  app-gate log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/d684741f-6e9e-4fba-bd80-15093e006b78/output.log`.
  It reports 125 passing files, one failing file, 1333 passing tests and one failing test.
- The sole failure is `apps/gm-react/src/app/help/changelog.test.ts:85`: the shipped-version
  assertion expects `0.3.7`, but `latestRelease()` returns `Unreleased`.
- Reproduced with `pnpm test:app apps/gm-react/src/app/help/changelog.test.ts --maxWorkers=3`:
  exit 1, six passing tests and the same single failure. Original output retrieved in full from
  `/tmp/rc-eng-4.4-changelog-failure.log`.
- Cause verified without modifying source or dependencies: invoke the current parser on
  `git show 66b7ab7f^:CHANGELOG.md`, `66b7ab7f:CHANGELOG.md`, and `HEAD:CHANGELOG.md`.
  Results are respectively `0.3.7` (two bullets), `Unreleased` (three bullets), and `Unreleased`
  (three bullets). Commit `66b7ab7f` added the populated preview section before this dependency
  branch's commits. The parser, its test and changelog have no diff from that base to HEAD.
- `apps/gm-react/src/app/help/changelog.ts:50` selects the first nonempty section regardless of
  whether it is released. `HelpMenu.tsx:43` uses the same function, so this is a product bug,
  not just a stale expected value. Changing the package version to `Unreleased`, removing
  preview notes or filtering only inside the test would conceal the defect.
- HANDOFF RC-ENG-4.4 → apps/gm-react/src/app/help/changelog.ts: make `latestRelease()` skip
  `[Unreleased]` even when it contains bullets, while keeping those entries in `parseChangelog()`.
  Add regressions for populated Unreleased before a shipped release and populated Unreleased
  without any shipped release (expect null). Keep the real shipped-version assertion intact.
  The production parser is outside this task's owned paths; no source fix is authorized here.
- No dependency was newly bumped or reverted: the controlled historical input comparison
  establishes this failure comes from the integrated documentation change, not a dependency.
  Existing dependency commits and unrelated release documentation are preserved.

### Report

BLOCKED RC-ENG-4.4: current app gate requires the out-of-scope changelog parser fix above.
The previously recorded Router audit and migration handoffs also remain unresolved. The supplied
operator results passed quality, formatting, typecheck, lint and core tests on `bbf3c825`; app
failed, and later gates were not reached. No all-green merged set or completed acceptance is
claimed. This pass changes only the journal; no push, promotion, PR closure or control-state edit.

## 12. loop/rc merged in; React Router 7 retried and kept (2026-09-18)

- Merged `origin/loop/rc` (`f0ec917f`) into the branch as `0a2c5797`. It merged cleanly and
  brings `32d9ed73` (fix(help): exclude unreleased notes from shipped release selection), the
  owning story's fix for the changelog failure in section 11. The app gate is green again.
- Retried `react-router-dom` `^6.30.5` → `^7.18.3`. With the one-day `minimumReleaseAge` it
  resolves 7.18.4. `pnpm audit` exits 0 with "No known vulnerabilities found", so the vitest,
  joi and both React Router advisories are cleared.
- Went back to the section 9 regression, `command-palette.spec.ts:262`, and reproduced it on
  desktop: the first `group` is `Zoom`. I added a throwaway spec that dumps the DOM with the
  palette open over `/board` and ran it on both routers. Router 6 and Router 7 produce the same
  DOM: the board's `Zoom` group and widget groups sit before the palette's `On this screen`,
  and no ancestor is `inert` or `aria-hidden`, because the DS `CommandPalette` has never
  isolated its siblings. The page-wide `getByRole('group').first()` passed on Router 6 only
  because the palette opened before the board's first render. Router 7 runs navigations in
  `startTransition`, so the board has already rendered when the palette opens.
- Fix: scope that assertion to the palette dialog (`page.getByRole('dialog', PALETTE)`). The
  claim it checks, that `On this screen` is the first group in the palette list, is unchanged.
  **Overlap:** `apps/gm-react/tests/e2e/command-palette.spec.ts` is outside this story's Owns.
  I made this one edit there so the audit criterion can be met, and I'm flagging it for the
  operator. No product source changed.
- Committed as `1de45c24`. Gate on that commit: `gates`, `typecheck`, `lint`, core
  279 / 4886, app 138 / 1521, cloud 39 / 521, tooling 26 / 193, `build` and
  `check:bundle-budget` all exit 0. The palette spec passes 36 / 36 on desktop-chromium and
  mobile-chromium with no retries.
- React 19 and Gradle 9.7.1 stay reverted for the reasons in sections 3–6, as the story's
  failed-bump policy allows.
- The full browser suite has not finished locally. I started it twice on `1de45c24`: one
  unsharded run and one run as four `--shard=n/4` runs on separate ports. Both died with the
  worker session after roughly 10 tests per shard, and neither reported a failure. The
  operator's browser gate is the evidence for the full suite.
