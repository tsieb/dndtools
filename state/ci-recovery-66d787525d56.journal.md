# ci-recovery-66d787525d56 run journal

## Scope

Repair GitHub CI for promoted commit `66d787525d56c124620ace1b63545e33ab667ecf` on `loop/rc`.
Failing workflow: CI (push run 34732810075, PR run 34732811690). Reproduce locally, fix the cause,
and verify without weakening tests or workflow protections. No push, promotion, loops, or
dispatcher control-state edits.

## Diagnosis

- Both runs fail the same job and step: `build-and-test` › Run unit tests (`pnpm test`). Critical,
  cloud and tooling suites pass; `test:app` fails 1 of 1334:
  `apps/gm-react/src/app/help/changelog.test.ts` › the shipped version is the changelog's latest
  release › `AssertionError: expected 'Unreleased' to be '0.3.7'`.
- Every step before it passed (gates, secrets, formatting, lint, typecheck, build, bundle budget).
  Only `test:coverage:core` was skipped behind the failure.
- Cause: `66b7ab7f` (RC release notes) put bullets under `## [Unreleased]` in `CHANGELOG.md`.
  `latestRelease` returned the first section that had any bullets and only skipped an EMPTY
  `[Unreleased]`, so it picked the unshipped notes.
- This is a real product bug, not a stale test. The Help menu's What's new body shows
  `latestRelease`, while its unseen-release badge keys on the built `__APP_VERSION__` (0.3.7). A
  0.3.7 build would have shown "Unreleased" notes against a 0.3.7 badge.

## Reconciliation with the integration branch

One `CHANGELOG.md` edit produced three sibling recovery tasks — `ci-recovery-66b7ab7f`,
`ci-recovery-2af32bc6` and this one — because `66b7ab7f`, `2af32bc6` and `66d78752` were each
promoted while the same assertion was red.

The sibling `ci-recovery-2af32bc6` landed the root-cause fix first, as `32d9ed73` on `loop/rc`.
This task's original candidate (`0c7d713a`, kept at the local tag `backup/pre-reconcile-66d78752`)
fixed the same line independently, which is why rebasing onto `a91319f5` conflicted in
`apps/gm-react/src/app/help/changelog.ts`.

The conflict is resolved in favour of the integration branch, on the merits rather than by
precedence:

- `32d9ed73` compares `release.version.trim().toLowerCase()`, so it also skips a whitespace-padded
  or differently-cased heading such as `## [ UNRELEASED ]`. The original candidate matched
  `/^unreleased$/i` with no trim, so it would have let `UNRELEASED` through — it fails one of
  `32d9ed73`'s own cases.
- `32d9ed73`'s four added cases subsume the original candidate's single case: its
  `it.each(['Unreleased', 'unreleased', ' UNRELEASED '])` block asserts exactly what the candidate
  asserted (populated preview notes skipped, shipped `0.2.0` selected) and additionally asserts the
  parser still returns the preview section, plus null-on-preview-only and the pre-existing
  empty-numbered-release behaviour.

Nothing from the original candidate is worth carrying forward, so this branch keeps only this run
journal on top of `a91319f5`. `CHANGELOG.md` is left as `66b7ab7f` wrote it; the preview notes
belong under `[Unreleased]`.

## Verification (local, reconciled tree, 2026-09-17)

The reported failure is the `pnpm test` step, so all four of its suites were run on the reconciled
tree:

- `pnpm test:critical` exit 0: 276 files, 4830 tests.
- `pnpm test:cloud` exit 0: 38 files, 499 tests.
- `pnpm test:app` exit 0: 134 files, 1481 tests — including the CI assertion that failed,
  `changelog.test.ts` 12 of 12.
- `pnpm test:tooling` exit 0: 26 files, 191 tests.
- `pnpm gates` passed: quality gate 6 gates owned and wired, docs check 254 files reachable and 283
  relative links resolved. The `file-size-warn` lines are warn-only and pre-exist on `a91319f5`.
- `pnpm format:check:changed` passed, `git diff --check` clean.

No assertion was weakened; this branch adds no test and changes no source. Mutation check on the
retained tests — with `latestRelease` reverted to its pre-fix body
(`releases.find((release) => release.items.length > 0) ?? null`), `changelog.test.ts` fails 5 of 12,
including the exact CI assertion `expected 'Unreleased' to be '0.3.7'` and all three
`it.each` preview cases. The source file was restored immediately after.

Not rerun locally: `pnpm lint`, `pnpm typecheck`, `pnpm build` and the bundle budget. This branch's
only diff against `a91319f5` is this markdown file, which none of them read. Central operator gates
and independent review remain external.

## Gotchas

- In non-TTY mode vitest prints only the summary (no per-test ✓/× lines). Grep for `FAIL`,
  `AssertionError`, `Test Files` and `Tests`.
- `test:app` uses `vitest.app.config.ts`. The root default config does not collect
  `apps/gm-react/src`, so a bare `vitest run <file>` there silently runs nothing.
- When a promoted commit's CI failure is inherited from an earlier promoted commit, expect a sibling
  task to have already fixed it. Diff `loop/rc` before writing any code — otherwise the rebase
  conflict is the first sign, and by then two candidates exist for one bug.
