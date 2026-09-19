# ci-recovery-841f77e39679 run journal

## Scope

Repair GitHub CI for promoted commit `841f77e39679969d5c790f45ba0c6e13963ff886`
(`feat(canvas): RC-CAN-7.2 screen metadata, pins and the screens read`). Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify the integration candidate without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA and both runs failed the **same single job**:

- [35095413146](https://github.com/tsieb/dndtools/actions/runs/35095413146) (push)
- [35095416494](https://github.com/tsieb/dndtools/actions/runs/35095416494) (pull_request, PR #76)

`Android unit, lint, and package checks` is the only failure in either run. Everything else on
the SHA is green — `build-and-test`, all three browser E2E shards, `accessibility (desktop +
mobile)`, `Electron smoke (Linux)`, plus the separate `Performance` (35095416570) and
`Supply Chain` (35095416616) workflows. `visual regression (golden routes)` was not scheduled on
this commit at all. The failure is one job wide and unrelated to the promoted commit's subject.

The job died in `Set up Android SDK`, before Gradle started. From
`gh run view 35095413146 --log-failed`:

```
Run android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699
with:
  cmdline-tools-version: 14742923
  accept-android-sdk-licenses: true
  log-accepted-android-sdk-licenses: true
  packages: tools platform-tools
...
Warning: Failed to find package 'tools'
Error: The process '/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1
```

Root cause: the workflows pinned
`android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699` (v4.0.1) but passed no
`packages` input, so the action fell back to its default of `tools platform-tools` — the runner log
echoes that exact default back under `with:`. `tools` is the obsolete standalone SDK Tools package
that `cmdline-tools` replaced, and Google has retired it from the SDK repository, so
`sdkmanager tools` now exits 1. This is an environment break rather than a code break, which is why
it took down every in-flight commit at once and the dispatcher opened one recovery task per
promoted SHA.

Reproduced independently against the real local SDK at `/home/trinkle/Android`, in both
directions, using a scratch `--sdk_root` so the repro could not disturb the host SDK:

- `sdkmanager --sdk_root=/tmp/sdkrepro-841f77e3 tools platform-tools` — the exact package list the
  action requests — printed `Warning: Failed to find package 'tools'` and exited **1**, matching
  the runner.
- `sdkmanager --sdk_root=/tmp/sdkrepro-841f77e3 platform-tools` exited **0** and materialised
  `/tmp/sdkrepro-841f77e3/platform-tools/adb` (10,642,368 bytes, `Pkg.Revision=37.0.1`). So
  `packages: platform-tools` is both necessary and still resolvable.

The scratch SDK root was deleted after the repro.

## Reconciliation with the integration branch

The repair was already upstream by the time this task was re-entered. The promoted commit's own
code is on the integration branch: `git merge-base --is-ancestor 841f77e3 origin/loop/rc`
succeeds. `origin/loop/rc` (tip `26cf41b3`) already carries:

- `31acff8e` `ci(android): stop requesting the retired 'tools' SDK package` — the pin itself, at
  all three `setup-android` call sites.
- `7b2e81de` "test(ci): fail closed when a workflow drops the Android `packages` pin" — the
  regression guard.
- `75053859`, `ae335601`, `830b7382`, `eebdf036` and `26cf41b3` — five sibling recoveries' journals.

This branch's only commit not on `loop/rc` was `e70d4d7b`, an independent duplicate of the same
repair (`packages: platform-tools` at the same three call sites, differing only in comment
wording) plus a weaker copy of the same guardrail and its journal. The branch was cut at `841f77e3`
and never picked up `31acff8e`. Read-only
`git merge-tree --write-tree --name-only origin/loop/rc HEAD` exited 1 with `CONFLICT (content)` in
`.github/workflows/ci.yml`, `release.yml` and `validate.yml` — the same three paths the gate
feedback reported. Both sides edit the same three `with:` blocks, so integrating the duplicate
would cost manual conflict resolution and change no behaviour.

The conflict is resolved in favour of the integration branch: this branch is reset onto `26cf41b3`
and the superseded candidate is preserved at the local tag `backup/pre-reconcile-841f77e39679`.

Dropping the duplicate loses no coverage, and that was checked rather than assumed:

- On the reset tree, `git grep -n setup-android@ -- .github/workflows/` returns exactly three call
  sites — `ci.yml:366`, `release.yml:343`, `validate.yml:88` — and all three carry
  `packages: platform-tools`. Those are the same three sites the dropped candidate touched.
- The upstream guardrail is **stronger** than the dropped one, not merely equivalent. Both assert
  that `packages` is pinned and that it does not contain `tools`; `7b2e81de` additionally asserts
  that `platform-tools` is still requested, a loss shape the dropped candidate would have missed.

## Verification

Run from the reset worktree at `26cf41b3`:

- `pnpm vitest run tests/unit/ci-guardrails.test.ts` — 14/14 pass, including
  "never asks the Android SDK for the retired `tools` package".
- `pnpm audit:repo` — 14/14 pass.
- `pnpm test:tooling` — 26 files, 192/192 pass.
- `actionlint` 1.7.12 over `.github/workflows/*.yml` — exit 0, no diagnostics.

A green guardrail alone does not prove it fails closed, so `7b2e81de`'s guard was mutation-checked
on this tree against all three loss shapes:

| Mutation on `ci.yml`                     | Result                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| restore `packages: tools platform-tools` | FAIL (1 failed \| 13 passed) — ``ci.yml setup-android requests the retired `tools`: expected [ 'tools', 'platform-tools' ] to not include 'tools'`` |
| delete the `with:` block entirely        | FAIL (1 failed \| 13 passed) — ``ci.yml setup-android must pin `packages`: expected 'undefined' to be 'string'``                                    |
| replace with `packages: emulator`        | FAIL (1 failed \| 13 passed) — ``ci.yml setup-android drops `platform-tools`: expected [ 'emulator' ] to include 'platform-tools'``                 |

`ci.yml` was restored after each mutation; `git diff` and `git status` are both empty, so the tree
is byte-identical to `26cf41b3`.

The upstream fix is confirmed green on a real runner, not just locally: on `31acff8e`
([35243233536](https://github.com/tsieb/dndtools/actions/runs/35243233536)) and `7b2e81de`
([35245713599](https://github.com/tsieb/dndtools/actions/runs/35245713599)) the
`Android unit, lint, and package checks` job **passes**, where it failed on every commit before
the pin. That is the job this task was opened for.

## Limits worth stating

`loop/rc` is still red, but on a different job than the one this task reports. Both runs above
fail only `visual regression (golden routes)`, and the artifacts name the failing snapshots:
`knowledge--parchment`, `knowledge--tavern` and `knowledge--high-contrast`. That is the known,
separately-diagnosed `/knowledge` re-baseline item (RC-KNW-2.2 `formatRelativeTime` rendering
"updated now" instead of a fixed date under the pinned clock), it has its own owner, and it was
never in scope here — it was not scheduled on `841f77e3` at all. Re-baselining those PNGs on a
dispatch branch has already been attempted repeatedly without integrating, so this task does not
add another duplicate attempt. The operator should expect that job red on this candidate for
reasons predating it.

## Outcome

No workflow or test change is carried by this branch. The reported failure's fix is already on the
integration branch, verified present, verified failing closed under three mutations, and verified
green on a runner. The only commit is this journal. No gate, assertion or workflow protection was
weakened.
