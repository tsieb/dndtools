# ci-recovery-582ed5198e29 run journal

## Scope

Repair GitHub CI for promoted commit `582ed5198e291aefdaa9c32a6a2d3b60a94dd33d`
(`RC-WID-6.8: stay inside the claim; show the range as the tile's figures`). Reported failing
workflow: `CI`. No push, promotion, loops, extra agents, or dispatcher control-state edits.

## Diagnosis

CI ran twice on the SHA. The push run (37484131164) was green. In the pull_request run
(37484139355), one job failed: `browser E2E (2-of-3)`. Every other job passed, and so did the
Performance and Supply Chain workflows.

The shard did not fail a test. Its log ends with `13 skipped` / `626 passed (19.0m)`, so all 639
tests in the shard ran, and then `The action 'Run Playwright shard' has timed out after 19
minutes.` The step was killed after the tests finished, while the reporter was still wrapping up.

That is a budget problem, not a flake in the promoted commit. `Run Playwright shard` step durations
from the GitHub API:

| Date (sampled runs)        | Per-shard step minutes                          |
| -------------------------- | ----------------------------------------------- |
| 2026-09-26                 | 13.2 / 13.1 / 12.7                              |
| 2026-09-30                 | 15.2 / 15.0 / 14.7                              |
| 2026-10-03                 | 15.7 / 10.5 / 14.8                              |
| 2026-10-05                 | 18.4 / 18.5 / 18.8                              |
| 2026-10-06 (last ~25 runs) | mostly 17-19; 6 shards killed at the 19-min cap |

Recent runs total about 50-56 shard-minutes. The suite is 1,916 tests (`playwright test --list`),
up from 550 per shard when the 19-minute cap was set in 9a691042. Per-spec time in the failing
shard is spread out: the largest spec, `responsive.spec.ts`, took about 142 s of 1,134 s. No single
test regressed. The friction-pass specs pushed the suite past what three shards can run, well past
the 12-minute shard budget in `docs/development/TESTING.md`, which says a budget overrun is
investigated, not raised.

## Fix

- `.github/workflows/ci.yml`: `browser-e2e` matrix goes from 3 to 5 shards (`1/5`..`5/5`, names
  `1-of-5`..`5-of-5`). The 19-minute step cap, the 10-minute setup cap, the 32-minute job cap,
  `fail-fast: false`, and the job's `if`/`needs` are unchanged. `playwright test --list --shard=i/5`
  gives 384/383/383/383/383 tests, so about 10-11 minutes per shard at current speed.
- `tests/unit/ci-guardrails.test.ts`: new guardrail. It requires at least 5 shards and a matrix
  that covers every `i/N` exactly once with matching names. It fails on the old 3-shard layout
  (verified: `expected 3 to be greater than or equal to 5`).
- `tests/unit/loop-integration-gate.test.ts`: the exact shard list it pins is now the five shards.
  It still asserts that loop/rc runs every shard.
- `docs/development/TESTING.md`, `docs/development/GIT_WORKFLOW.md`: shard count, plus the rule that
  growth gets another shard and the step cap stays put.

The repo is public (Actions minutes are free), and no branch protection pins the old
`browser E2E (n-of-3)` check names (`main` and `loop/rc` both return "Branch not protected").

## Verification (local)

- `pnpm exec vitest run tests/unit/ci-guardrails.test.ts` → 18 passed; with HEAD's ci.yml
  restored → the new test fails as expected.
- `pnpm test:tooling` → 31 files, 247 tests passed.
- `pnpm typecheck` → exit 0. `pnpm gates` → exit 0.
- `prettier --check` and `eslint` on the changed files → clean.

Not done locally: the hosted-runner timeout itself can't be reproduced on this host. The fix only
re-partitions the suite, and no test or assertion changed. Proving the new shard times needs a
hosted CI run, which is the operator's gate.
