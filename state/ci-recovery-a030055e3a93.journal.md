# CI recovery for a030055e3a93 run journal

## Scope

Repair the reported CI failure for promoted commit
`a030055e3a93bf57b54019cfd88a7e0b77c63bd7` on this task branch, and reconcile the branch with
integration tip `278cb9eb7407e8ffcd087c5caaaefc25eb663460` after the previous attempt's rebase
conflicted in `.github/workflows/ci.yml`, `release.yml` and `validate.yml`. No push, promotion,
dispatcher control change, additional loop, or additional agents.

## Diagnosis

The reported failure is real and was confirmed from GitHub, not inferred. Both CI runs on the
promoted commit — [35129766720](https://github.com/tsieb/dndtools/actions/runs/35129766720) and
[35129772197](https://github.com/tsieb/dndtools/actions/runs/35129772197) — are red with exactly
one failing job, `Android unit, lint, and package checks`, and that job dies in its `Set up Android
SDK` step, before Gradle runs and before any repo file is compiled. Every other job on the SHA
passed, and the sibling Performance and Supply Chain workflows passed, so the failure is
environmental drift rather than a defect in `a030055e`, which touches canvas flow-tile widths only.

Root cause: the workflows pin `android-actions/setup-android` v4.0.1 but originally passed no
`packages` input, so the action took its default of `tools platform-tools`. Google retired the
obsolete standalone `tools` package (SDK Tools 26.1.1), so `sdkmanager` exits 1 with
`Failed to find package 'tools'`. This is drift underneath a correctly pinned action, which is why
it began failing without any workflow change: the last green run was on 2026-09-13 and every run
from 2026-09-16 07:45Z onward failed on this one step.

## The repair was already upstream

The fix is not mine to land. `loop/rc` already carries it:

- `31acff8e` — `packages: platform-tools` pinned at all three `setup-android` call sites.
- `7b2e81de` — a `ci-guardrails` test that fails closed when a workflow drops the pin.

Both are ancestors of the integration tip, and `a030055e` itself is an ancestor of that tip. The
upstream fix is **green on a real runner**, which is the only evidence that actually settles this:
the Android job passes in runs
[35266414919](https://github.com/tsieb/dndtools/actions/runs/35266414919) and
[35264985380](https://github.com/tsieb/dndtools/actions/runs/35264985380), having failed on every
commit before the pin. That cannot be reproduced locally — the job needs a GitHub runner with KVM
and the API 36 emulator — so the runner result is cited rather than re-derived here.

## Reconciliation

This branch's only non-upstream commits were `e1d5a836` (an independent duplicate of the same pin,
plus a weaker copy of the same guardrail) and `196f7554` (its journal). The duplicate is why the
rebase conflicted: the two changes are semantically identical and differ only in comment wording at
all three call sites.

Resolved in favour of the integration branch — reset onto `278cb9eb`, with the superseded candidate
preserved at the local tag `backup/pre-reconcile-a030055e3a93` (`196f7554`). Nothing is lost. The
upstream guardrail is strictly stronger than the one it replaces: it asserts the pin is present,
that `tools` is absent, **and** that `platform-tools` is still requested. The discarded copy
asserted only the first two, so dropping `platform-tools` would have slipped past it.

This branch therefore carries no workflow or test change. No gate, assertion or workflow protection
was weakened.

## Verification

Run on the reset tree, 2026-09-17, rather than assumed from the upstream commits.

| Check                                             | Result                            |
| ------------------------------------------------- | --------------------------------- |
| `packages: platform-tools` present at all 3 sites | ci.yml, release.yml, validate.yml |
| `setup-android` still pinned to SHA `40fd30fb`    | unchanged at all 3 sites          |
| `pnpm audit:repo` (ci-guardrails)                 | 14 passed / 14                    |
| `pnpm test:tooling`                               | 192 passed / 26 files             |
| `prettier --check` on this journal                | clean                             |
| Android job on the upstream pin (GitHub runner)   | success                           |

## Mutation checks on the upstream guardrail

The guardrail was mutation-checked against all three ways the fix could be lost, each applied to a
different workflow file to confirm the guard walks every workflow rather than only `ci.yml`. Each
file was restored after its mutation, and `git status` was empty after each revert.

| Mutation                                         | File           | Caught by                                                                                 |
| ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| Restore the retired `tools` in the packages list | `ci.yml`       | `ci.yml setup-android requests the retired 'tools'`: expected not to include `tools`      |
| Delete the `with:` block (restore the default)   | `validate.yml` | `validate.yml setup-android must pin 'packages'`: expected `'undefined'` to be `'string'` |
| Drop `platform-tools` from the pin               | `release.yml`  | `release.yml setup-android drops 'platform-tools'`: expected `['emulator']` to include it |

`pnpm audit:repo` returned 14/14 again after the final revert.

## Not done

- Nothing pushed, promoted or retried; no dispatcher state touched.
- `loop/rc`'s remaining red is `visual regression (golden routes)` on the `/knowledge` snapshots,
  which is the separately-tracked `formatRelativeTime` re-baseline item. It predates this branch,
  was never scheduled on `a030055e`, and is not the failure this task reported, so no duplicate
  re-baseline attempt is added here — thirteen dispatch branches have already re-baselined those
  same nine PNGs without one landing.
- `actionlint` is not installed in this environment and was not run; nothing is claimed from it.
