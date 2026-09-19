# ci-recovery-9cf943d4afdb run journal

## Scope

Repair GitHub CI for promoted commit `9cf943d4afdb96f3b997bd4747fd54d6559fb625`
(`docs(canvas): RC-CAN-7.1 reconcile ADR-041 with the docs-gate base`). Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify the integration candidate without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA and both runs failed the **same single job**:

- [35082889437](https://github.com/tsieb/dndtools/actions/runs/35082889437) (`pull_request`)
- [35082885069](https://github.com/tsieb/dndtools/actions/runs/35082885069) (`push`)

In both, `Android unit, lint, and package checks` is the only failure. Everything else on the SHA
passed — `detect runtime changes`, `build-and-test`, all three `browser E2E` shards,
`Electron smoke (Linux)`, `accessibility (desktop + mobile)`, with `smoke-gate` skipped — and the
`Performance` (35082889434) and `Supply Chain` (35082889588) workflows on the same SHA both
succeeded. The failure is one job wide and unrelated to the promoted commit's subject: `9cf943d4`
edits architecture documentation and touches no Android code.

The job died in `Set up Android SDK`. From `gh run view 35082885069 --log-failed`:

```
packages: tools platform-tools
...
Warning: Failed to find package 'tools'
Error: The process '/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1
```

Root cause: the workflows pin
`android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699` (v4.0.1) but passed no
`packages` input, so the action fell back to its default of `tools platform-tools` — the runner log
echoes that exact default back. `tools` is the obsolete standalone SDK Tools package that
`cmdline-tools` replaced, and Google has retired it from the SDK repository, so `sdkmanager tools`
now exits 1. That makes this an environment break rather than a code break, which is why it took
down every in-flight commit at once and the dispatcher opened one recovery task per promoted SHA.

Reproduced against the real local SDK at `/home/trinkle/Android`, in both directions, using a
scratch `--sdk_root` so the repro could not disturb the host SDK:

- `sdkmanager --sdk_root=/tmp/sdkrepro-9cf943d4 tools platform-tools` — the exact package list the
  action requests — printed `Warning: Failed to find package 'tools'` and exited **1**, matching
  the runner byte for byte.
- `sdkmanager --sdk_root=/tmp/sdkrepro-9cf943d4 platform-tools` exited **0** and materialised
  `/tmp/sdkrepro-9cf943d4/platform-tools/adb` (10,642,368 bytes, platform-tools r37.0.1). So
  `packages: platform-tools` is both necessary and still resolvable.

## Reconciliation with the integration branch

The repair was already upstream by the time this task was re-entered. `origin/loop/rc` has
advanced past this branch's merge base (`83f94aab`, which
`git merge-base --is-ancestor 83f94aab origin/loop/rc` confirms is an ancestor of the integration
branch) and already carries:

- `31acff8e` `ci(android): stop requesting the retired 'tools' SDK package` — the pin itself.
- `7b2e81de` "test(ci): fail closed when a workflow drops the Android `packages` pin" — the
  regression guard.
- `75053859`, `ae335601` and `830b7382` — three sibling recoveries' journals; `830b7382` is the tip.

The promoted commit's own code is on the integration branch already:
`git merge-base --is-ancestor 9cf943d4afdb96f3b997bd4747fd54d6559fb625 origin/loop/rc` succeeds,
with 43 commits between it and the tip.

This branch's only commit not on `loop/rc` was `234378d6`, an independent duplicate of the same
repair (`packages: platform-tools` at the same three call sites), with
`git merge-base --is-ancestor 31acff8e 234378d6` failing — the branch was cut before the fix
integrated and never picked it up. Read-only
`git merge-tree --write-tree --name-only origin/loop/rc 234378d6` exited 1 with
`CONFLICT (content)` in `.github/workflows/ci.yml`, `release.yml` and `validate.yml`: both sides
edit the same three `with:` blocks and differ only in comment wording. Integrating it would cost
manual conflict resolution and change no behaviour.

The conflict is resolved in favour of the integration branch: this branch is reset onto
`830b7382`, and the superseded candidate is preserved at the local tag
`backup/pre-reconcile-9cf943d4afdb` rather than discarded.

Equivalence was verified rather than assumed. On `loop/rc`,
`git grep -c setup-android@ -- .github/workflows/` returns exactly three call sites —
`ci.yml:366`, `release.yml:343`, `validate.yml:88` — and all three carry
`packages: platform-tools`. Those are the same three sites the dropped candidate touched, so no
fourth site is left on the broken default. Nothing from the candidate's workflow diff is worth
carrying forward, so this branch modifies no workflow file.

## The retained guardrail fails closed

A green test run does not prove a guard would catch the regression, so `loop/rc`'s
`ci-guardrails` case (`never asks the Android SDK for the retired 'tools' package`) was
mutation-checked against all three ways the pin could be lost. Each mutation was applied to
`.github/workflows/validate.yml`, run, then reverted with `git checkout -- .github/workflows/`;
the worktree was confirmed clean afterwards and the baseline re-run to 14 passed.

| Mutation                                                        | Result              | Assertion that caught it              |
| --------------------------------------------------------------- | ------------------- | ------------------------------------- |
| Baseline, unmodified tree                                       | 14 passed           | —                                     |
| Delete the `with:` block (restores the action's broken default) | 1 failed, 13 passed | `setup-android must pin \`packages\`` |
| Reinstate `packages: tools platform-tools`                      | 1 failed, 13 passed | `requests the retired \`tools\``      |
| Swap `packages: platform-tools` for `packages: emulator`        | 1 failed, 13 passed | `drops \`platform-tools\``            |

The first mutation is the one that matters most, and it is the one the dropped candidate shipped no
test for at all: `234378d6` changed only workflow YAML, so the pin there was one deleted `with:`
block away from silently reopening the outage. The retained guard is strictly stronger than
anything the candidate offered, which is a second reason not to reconcile the duplicate by hand.

## The fix is confirmed green on a real runner

The Android jobs cannot be executed on this host — there is no GitHub runner and no emulator — so
local Gradle cannot close the loop. Observation on a runner does: **both** CI runs on the
integration tip `830b7382`, [35255388441](https://github.com/tsieb/dndtools/actions/runs/35255388441)
and [35255380366](https://github.com/tsieb/dndtools/actions/runs/35255380366), record
`Android unit, lint, and package checks` as **success**, as does
[35245713599](https://github.com/tsieb/dndtools/actions/runs/35245713599) on `7b2e81de`. The exact
job this task was opened for passes with the pin in place.

No protection was traded away for that green. The following `Install Android API 36 toolchain` step
still installs `platform-tools`, `platforms;android-36` and `build-tools;36.0.0` explicitly, and
still hard-asserts the license run's exit status via `test "$SDKMANAGER_STATUS" -eq 0`.

## Out of scope, flagged not absorbed

CI on `loop/rc` is still red, but on a **different** job: `visual regression (golden routes)` fails
on both runs at the tip.

That job is not this task's failure, and that is a matter of record rather than judgement: it did
not exist at `9cf943d4`. `git grep golden 9cf943d4afdb -- .github/workflows/ci.yml` returns
nothing, the job is defined at `ci.yml:262` only on the tip, and neither failing run on the
promoted SHA lists the job among its nine. It already has its own recovery work in flight —
repeated `/knowledge` PNG re-baselines whose blocker is integration, not diagnosis. Re-baselining
from here would duplicate that work and push an unreviewed visual change through a recovery scoped
to an SDK package, so it is left alone.

## Validation

On the reconciled tree:

- `pnpm ci:local` — **exit 0, all eight steps PASS**: `gates`, `security:secrets`,
  `format:check:changed`, `lint`, `typecheck`, `build`, `test`, `test:coverage:core`. This mirrors
  the CI `build-and-test` job. Core coverage: 89.88% statements, 79.91% branches, 93.16%
  functions, 94.09% lines.
- `vitest run tests/unit/ci-guardrails.test.ts` — 14 passed, plus the three mutations above.
- Local SDK reproduction, both directions, as recorded under Diagnosis.
- `prettier --check` on this journal — clean, so the changed-files format gate stays green on the
  one file this branch adds.

Nothing was weakened. This branch changes exactly one file, this journal. No workflow, no test, no
assertion, and no source file is touched, so no protection could have been relaxed.
