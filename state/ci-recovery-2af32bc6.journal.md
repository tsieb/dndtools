# CI recovery for 2af32bc6 run journal

## Scope

Repair CI for promoted commit `2af32bc6ea9f130191eec673b1d420dab2abd5d1` on the
current task branch. Preserve tests and workflow protections; commit locally. No push,
promotion, dispatcher control changes, additional loop, or additional agents.

## Diagnosis

- Started from a clean worktree at the promoted commit.
- No applicable `AGENTS.md` files or callable Headroom tools were found. Commands and
  original output are retained under `/tmp/ci-recovery-2af32bc6-*.log`.
- Inspected GitHub CI runs [34733516228](https://github.com/tsieb/dndtools/actions/runs/34733516228)
  and [34733514372](https://github.com/tsieb/dndtools/actions/runs/34733514372).
  Both fail `build-and-test` at `Run unit tests`, in `changelog.test.ts:85`:
  `expected 'Unreleased' to be '0.3.7'`. Original failed-step logs saved as
  `failed.log` and `pr-failed.log` with the prefix above.
- The promoted-commit run passed all three browser shards. Coverage and dependent
  accessibility, Electron, and Android jobs did not run after the unit failure.
- `latestRelease` selects the first section containing bullets, including the new
  populated `[Unreleased]` preview. Help uses this result for shipped release notes.
  The parser must preserve preview entries, while shipped-release selection must skip them.

## Validation

- `pnpm test:app apps/gm-react/src/app/help/changelog.test.ts` reproduced the exact
  assertion (exit 1, 1 failed / 6 passed; `repro.log`) on Node 22.22.3 / pnpm 10.34.5.
- Added preview selection regressions before fixing production code: 5 failed / 7
  passed (`regression-red.log`). Existing assertions remain unchanged.
- `latestRelease` now excludes the reserved Unreleased heading, case-insensitively
  and with surrounding whitespace normalized. Parsing still retains preview bullets;
  sections without notes are still skipped. No changelog or workflow changes.
- Focused suite now passes all 12 tests (`focused.log`, exit 0). The same 12 tests
  also pass under Node 24.21.0, matching GitHub's Node major (`node24.log`, exit 0).
- `CI=1 pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/help-menu.spec.ts`
  passes all 6 desktop/mobile tests with no retries (`browser.log`, exit 0). The
  worktree-specific Vite server was started by Playwright with server reuse disabled.
- `pnpm ci:local` passed on the default Node 22.22.3 runtime (`ci-local.log`, exit 0):
  quality gates, secret scan, changed-file formatting, full lint, workspace typecheck,
  production build, all unit suites, and core/security coverage floors. Lint reported
  15 existing warnings and no errors.
- Unit totals: core 273 files / 4,779 tests; cloud 36 files / 482 tests; app 126 files /
  1,339 tests; tooling 25 files / 187 tests. All 6,787 tests passed.
- Core coverage passed: statements 89.76%, branches 79.78%, functions 93.05%, lines 93.97%.
- `pnpm check:bundle-budget` passed against the completed production build
  (`bundle.log`, exit 0; core bundle 533.7 KiB gzipped). This workflow step is not
  included in the existing `ci:local` wrapper, so it was run separately.
- Prettier on the three intended files and `git diff --check` passed. Original log
  output and command exit codes were inspected directly for each result above.

## Handoff

- Intended changes: release selection fix, five additional regression cases, this journal.
  The original package-version assertion and all workflow protections remain intact.
- Validation covered the task candidate based on `2af32bc6ea9f130191eec673b1d420dab2abd5d1`.
  Commit is local to the current task branch; central integration gates and independent
  review remain the operator's next steps. No new remote CI run was triggered.
- The complete browser suite, accessibility, Electron, and Android jobs were not rerun
  locally; the focused Help browser coverage passed as recorded above.
