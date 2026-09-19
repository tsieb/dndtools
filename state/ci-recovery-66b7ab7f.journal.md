# ci-recovery-66b7ab7f — Repair GitHub CI for 66b7ab7f7f31

## Failure

- CI runs `34731236346` (push) and `34731243240` (pull_request) on `loop/rc` both failed in
  `build-and-test` › `Run unit tests`. All three browser E2E shards passed; `smoke-gate`,
  accessibility, Electron, and Android were skipped behind the failed job.
- Exactly one failing test in both runs, read from the full `--log-failed` output
  (`Failed Tests 1`): `apps/gm-react/src/app/help/changelog.test.ts > the shipped version is the
changelog's latest release > agree, so the badge and the release notes name the same version` —
  `AssertionError: expected 'Unreleased' to be '0.3.7'`.
- Reproduced locally on `2af32bc6` with the focused suite (1 failed, 6 passed).

## Cause

- `66b7ab7f` (RC-DOC-1.4) added bulleted RC preview notes under `## [Unreleased]` in
  `CHANGELOG.md`. That is valid Keep a Changelog usage.
- `latestRelease` (`apps/gm-react/src/app/help/changelog.ts`) returned the first section with any
  bullets, so it only skipped an _empty_ `[Unreleased]`. It began returning `Unreleased` while the
  Help badge tracks the built version (`0.3.7`), so the in-app "What's new" would have shown
  unshipped notes for a 0.3.7 build. The test caught a real mismatch.

## Reconciliation with the integration branch

- The first candidate for this task fixed `latestRelease` directly (`e51f5122`, kept at the local
  tag `backup/pre-rebase-66b7ab7f`). While it sat in review, the sibling task
  `ci-recovery-2af32bc6` landed `32d9ed73` on `loop/rc` — the same root-cause fix for the same
  assertion. Rebasing onto `32d9ed73` therefore conflicted in `changelog.ts`.
- `32d9ed73` is a strict superset of the candidate: it compares
  `release.version.trim().toLowerCase() !== 'unreleased'`, so it also handles a whitespace-padded
  heading, which the candidate's untrimmed comparison did not.
- The conflict is resolved in favour of the integration branch. Both of the candidate's added test
  cases are subsumed by `32d9ed73`'s `it.each(['Unreleased', 'unreleased', ' UNRELEASED '])` and its
  `is null when only populated preview notes exist`, so dropping them loses no coverage. This
  branch now carries only this journal on top of `32d9ed73`.
- Verified rather than assumed: reverting `latestRelease` to its pre-fix body and rerunning the
  retained suite fails 5 tests, including the exact CI assertion
  (`expected 'Unreleased' to be '0.3.7'`). The assertions still catch the reported regression.

## Validation (repo root, on the rebased head)

Each command's original output was read for its exit status; logs are under `/tmp/ci-rec-66b/`.

- `pnpm test:app apps/gm-react/src/app/help/changelog.test.ts` — exit 0, 12 passed (the CI
  assertion that failed on `66b7ab7f`).
- Mutation check described above — exit 1, 5 failed / 7 passed, confirming the suite is not
  vacuously green.
- Every `build-and-test` step from `.github/workflows/ci.yml`, in job order, all exit 0:
  `pnpm gates`, `pnpm security:secrets`, `pnpm format:check:changed`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build`, `pnpm check:bundle-budget` (core bundle 533.7 KiB gzipped,
  within budget), `pnpm test`, `pnpm test:coverage:core`.
- `pnpm test` — the step that failed in CI — exit 0: 273 + 36 + 126 + 25 files and
  4,779 + 482 + 1,339 + 187 = 6,787 tests passed, 0 failed.
- `pnpm test:coverage:core` exit 0: statements 89.76%, branches 79.78%, functions 93.05%,
  lines 93.97%.
- Browser E2E was not rerun locally. All three shards already passed on `66b7ab7f` itself, and
  the full browser, accessibility, Electron, and Android jobs passed on `32d9ed73` in CI.
- CI on `32d9ed73` itself is green end to end (runs `34736538315` push and `34736539741` PR),
  including the accessibility, Electron, and Android jobs that were skipped on `66b7ab7f`.
- No test or workflow protection was weakened. `CHANGELOG.md`, `package.json`, and
  `.github/workflows/` are untouched.
- No push, promotion, loop launch, or dispatcher control-state edits.
