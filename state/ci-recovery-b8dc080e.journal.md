# ci-recovery-b8dc080e58ff — repair GitHub CI for `b8dc080e`

Task: repair GitHub CI for promoted commit `b8dc080e58ff4ec6a0736e608db5c41ae90659c6`
(`fix(ux): keep one gold primary per surface beside the detail pane`).
Failing workflow: CI.

This is the second pass. The first pass diagnosed both red jobs and cherry-picked the two
existing repairs onto this branch. The gate then returned the branch with a rebase conflict
against `a967a64d` in `.github/workflows/{ci,release,validate}.yml`. That conflict is the
finding: both repairs reached the integration branch in the meantime, so this pass is a
reconciliation. The branch now carries no code — only this journal.

## Reported failure

`CI` red on `b8dc080e` — runs
[35188378075](https://github.com/tsieb/dndtools/actions/runs/35188378075) (push) and
[35188382135](https://github.com/tsieb/dndtools/actions/runs/35188382135) (PR). Read from the
job list rather than the run summary, exactly two jobs failed and nothing else — `build-and-test`,
all three browser E2E shards, accessibility and the Electron smoke test were green:

```
failure  visual regression (golden routes)
failure  Android unit, lint, and package checks
```

Neither failure originates in `b8dc080e`.

1. **`visual regression (golden routes)`** — all nine `/knowledge` captures (3 viewports x 3
   themes) failed `expect(page).toHaveScreenshot`; no other route did. RC-KNW-2.2 moved the note
   card in `screens/knowledge/index.tsx` from absolute `formatStamp` to `formatRelativeTime`, so
   against the suite's pinned clock the baseline's `updated Mar 14` renders as `updated now`.
   Both forms are deterministic, so these were stale baselines, not a clock-dependent flake.
2. **`Android unit, lint, and package checks`** — died 24s in at `Set up Android SDK`, before any
   repo code ran. `android-actions/setup-android` (pinned `40fd30fb`, v4.0.1) defaults `packages`
   to `tools platform-tools`, and Google has retired the obsolete `tools` (SDK Tools 26.1.1)
   package from the SDK repository. Registry drift, not a defect in the promoted commit.

## Reconciliation

Both repairs are now on `loop/rc`, so this branch's cherry-picks are redundant and were the
source of the rebase conflict. Rebased onto `a967a64d` with
`git rebase --onto a967a64d 097abb1d`, which drops both and replays only this journal. Verified
they were genuinely superseded rather than merely similar before dropping them:

| Dropped commit                                | Superseded by, on `loop/rc`                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `c408bccd` Android pin + `ci-guardrails` case | `packages: platform-tools` on all three `setup-android` steps, plus its own guardrail case                            |
| `097abb1d` nine `/knowledge` baselines        | `283580fc` — `git diff origin/loop/rc HEAD -- apps/gm-react/tests/visual/` is empty, so the images are byte-identical |

The integration branch's guardrail is kept and is the stricter of the two: it asserts
`packages` is pinned, that it does not contain `tools`, **and** that it still contains
`platform-tools`. The dropped version omitted that last assertion. Nothing was weakened by
resolving in `loop/rc`'s favour; the reconciled branch is a strict superset of the protection
either pass proposed.

## Verification

### The reported jobs are green on this branch's base

GitHub's own history isolates each repair against the job it targets:

| Commit on `loop/rc`                             | Android job | Visual job | Push run    |
| ----------------------------------------------- | ----------- | ---------- | ----------- |
| `b8dc080e` (reported)                           | FAIL        | FAIL       | 35188378075 |
| `7b1621e4` (Android pin, no re-baseline)        | pass        | FAIL       | 35274490182 |
| `9c637eb0` (both repairs landed)                | pass        | pass       | 35281639286 |
| `bad7c0c7` (= `a967a64d~1`, this branch's base) | pass        | pass       | 35285027836 |

### The retained guardrail still fails closed

A green run does not prove a guardrail is load-bearing, so `ci.yml` was mutated two ways and the
kept test caught each. `git status` was clean after each revert.

| Mutation                                             | Result                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `packages: platform-tools` -> `tools platform-tools` | FAIL — `ci.yml setup-android requests the retired 'tools'` |
| deleted the whole `with:` block (takes the default)  | FAIL — `ci.yml setup-android must pin 'packages'`          |

Unmutated: `npx vitest run tests/unit/ci-guardrails.test.ts` -> 14 passed.

### Local gates on the reconciled head

Re-run here rather than carried over, because the rebase moved this branch across 26 commits of
`loop/rc` that the first pass never measured.

| Gate                                                        | Result                                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `pnpm typecheck`                                            | exit 0 — core, cloud-fns, gm-react               |
| `pnpm lint`                                                 | exit 0 — non-text contrast gate passed           |
| `pnpm test`                                                 | exit 0 — 7002 tests (4830 + 499 + 1481 + 192)    |
| `pnpm build`                                                | exit 0 — `check-prod-bundle: OK`, 83 JS assets   |
| golden routes, pinned container, `--update-snapshots=none`  | exit 0 — 135 passed (2.8m), 0 failed, no retries |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs` | exit 0 — 135 files, 12796.0 of 32768.0 KiB       |
| `pnpm format:check:changed -- --base loop/rc`               | exit 0                                           |

The golden-route run passed `--update-snapshots=none`, so it could only compare, never rewrite;
`git status` afterwards was empty, confirming no baseline was silently refreshed to manufacture a
pass. That run also re-proves `b8dc080e`'s own "one gold primary per surface" change moves no
golden-route pixels on this tree.

`pnpm lint` still prints `emphasis lint: 1 baseline entry is above the current count`
(`display-face-below-24px` 83 vs baseline 84). Lint exits 0 and this branch has no code delta
against `loop/rc`, so the message is inherited from the integration branch rather than introduced
here; the baseline was left untouched rather than ratcheted inside a CI-recovery change.

## Notes for the operator

The first pass warned that every newly promoted commit would keep failing these two jobs until one
recovery branch merged. That has now happened — both repairs are on `loop/rc` and its tip is
green — so the recurrence is closed and this branch exists only to record it.

Local checks only — no push, no promotion, no dispatcher control change, no additional loop or
agents.
