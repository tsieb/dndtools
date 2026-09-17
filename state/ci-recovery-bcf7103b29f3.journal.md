# ci-recovery-bcf7103b29f3 run journal

## Scope

Repair GitHub CI for promoted commit `bcf7103b29f33db8533cc8cb0e99d6a1266e7d2c` on `loop/rc`.
Failing workflow: CI (push run 35228988151, PR run 35228993996). Reproduce locally, fix the cause,
and verify without weakening tests or workflow protections. No push, promotion, loops, or
dispatcher control-state edits.

## Diagnosis

The run has **two independent red jobs**, and neither is a defect in `bcf7103b` — which is itself
only a docs commit (`docs(ci): record the 66d78752 CI recovery and its reconciliation`). Both are
recurrences of already-diagnosed causes whose fixes have never reached `loop/rc`.

Green jobs: `detect runtime changes`, `build-and-test`, all three `browser E2E` shards,
`accessibility`, `Electron smoke`, `Performance`, `Supply Chain`.

### 1. `Android unit, lint, and package checks` — fails 43s in at `Set up Android SDK`

```
[command]/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager tools
Warning: Failed to find package 'tools'
Error: The process '.../sdkmanager' failed with exit code 1
```

`android-actions/setup-android` (pinned `40fd30fb`, v4.0.1) defaults its `packages` input to
`tools platform-tools` — the failed step's own `with:` echo confirms it — and Google removed the
obsolete `tools` (SDK Tools 26.1.1) package from the SDK repository on 2026-09-16. The job dies
before installing a single toolchain package. This is runner/registry drift, not application code.

Reproduced locally in one command against the live repository, no GitHub involved:

```
$ ANDROID_HOME=/home/trinkle/Android /home/trinkle/Android/cmdline-tools/latest/bin/sdkmanager tools
Warning: Failed to find package 'tools'
```

### 2. `visual regression (golden routes)` — 9 failed / 126 passed

Every failure is `/knowledge`, and only `/knowledge` — 3 viewport projects (`visual-desktop`,
`visual-rail`, `visual-phone`) × 3 themes (`tavern`, `parchment`, `high-contrast`). Each is a
small, stable text-run diff (386 px desktop-tavern, 210 px phone-high-contrast; ratio 0.01), which
reproduced identically on Playwright's automatic retry.

Cause: `456b27f4` (RC-KNW-2.2) changed `screens/knowledge/index.tsx` from an absolute
`formatStamp(n.updatedAt, formatDate)` to `formatRelativeTime(new Date(n.updatedAt))`. The suite
pins the clock to `FIXED_TIME` = `2026-03-14T15:30:00Z`, which is exactly the seeded notes'
`updatedAt`, so the baseline reads `updated Mar 14` and the render reads `updated now`. **Both
values are deterministic** — this is a stale baseline, not a clock-dependent flake, so
re-baselining is the correct repair and does not weaken the gate.

## Repair

Both fixes already exist as reviewed commits that have never been merged to `loop/rc`, so this
task cherry-picks them rather than re-authoring conflicting duplicates:

- `7b59b160` — `git cherry-pick -x e1d5a836`: pins `packages: platform-tools` on the
  `setup-android` step in `ci.yml`, `release.yml` and `validate.yml`, and adds the
  `tests/unit/ci-guardrails.test.ts` case that fails closed if any of them regresses.
- `14febe02` — `git cherry-pick -x 49dbebff`: the nine `/knowledge` baseline PNGs.

Both applied cleanly onto `bcf7103b` (the `ci.yml` hunk auto-merged; the baselines applied
verbatim). Cherry-picking matters for the Android fix specifically: a re-authored patch would
silently lack the guardrail test.

## Verification

- **Guardrail suite**: `npx vitest run tests/unit/ci-guardrails.test.ts` → 14 passed (13
  pre-existing + the new Android case).
- **Mutation check, both loss shapes** — a green tooling run alone does not prove the guardrail
  fails closed:
  - restore `packages: tools platform-tools` → FAILS,
    `ci.yml still requests the removed 'tools' package: expected [ 'tools', 'platform-tools' ] to not include 'tools'`
  - delete the `with:` block entirely (the likelier regression) → FAILS,
    `ci.yml leaves setup-android on its default packages: expected 'undefined' to be 'string'`

    Caught only by the `typeof packages === 'string'` assertion. Tree restored clean after each.

- **Baseline size budget**: `node apps/gm-react/tests/visual/check-baseline-budget.mjs` → 135
  files, 12796.0 of 32768.0 KiB. CI enforces this as a separate step.
- **Full visual suite in the pinned container**, the only environment the committed baselines
  describe: `CI=1 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none` →
  **135 passed / 0 failed in 2.4m, exit 0**, no retry lines, and `git status` clean afterwards
  (at `--update-snapshots=none` the run writes nothing, so a clean tree confirms all nine
  `/knowledge` baselines matched as committed rather than being silently rewritten). All nine
  captures CI reported are in that run: desktop 5/20/35, rail 50/65/80, phone 95/110/125.
- **Root unit suites**: `npx vitest run tests/unit/` → 26 files, 192 tests passed.

No assertion was weakened. `UPDATE_SNAPSHOTS` still defaults to `none` in `ci.yml`, so CI keeps
failing on any diff or missing baseline; the Android change drops only the dead `tools` package
and leaves every toolchain package the job installs afterwards untouched.

## Note for the operator

Neither fix is authored here and neither is new. The Android pin has now been carried by nine
consecutive `ci-recovery-*` task branches and the `/knowledge` re-baseline by six, because
recovery branches are never the thing that reaches `loop/rc`. Every newly promoted commit
inherits both failures and spawns another recovery task. This stops recurring only when one of
these branches is actually merged.
