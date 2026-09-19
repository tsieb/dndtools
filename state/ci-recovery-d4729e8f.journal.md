# ci-recovery-d4729e8f run journal

## Scope

Repair GitHub CI for promoted commit `d4729e8fba3267cce310057ceee24813d74737c5`
(`docs(gates): reach the generated component reference from the docs index`). Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify the integration candidate without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA — [35075984847](https://github.com/tsieb/dndtools/actions/runs/35075984847)
(`push`) and [35075988984](https://github.com/tsieb/dndtools/actions/runs/35075988984)
(`pull_request`) — and both failed the **same single job**,
`Android unit, lint, and package checks`. Every other job on that run passed
(`detect runtime changes`, `build-and-test`, all three `browser E2E` shards,
`Electron smoke (Linux)`, `accessibility (desktop + mobile)`; `smoke-gate` skipped), and the
`Performance` and `Supply Chain` workflows on the same SHA both succeeded. So the failure is one
job wide, and it is not in the promoted commit's own subject area — `d4729e8f` only edits docs.

The job died at `Set up Android SDK`, 35s in:

```
[command]/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager tools
...
Warning: Failed to find package 'tools'
Error: The process '/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1
```

Root cause: the workflows pin
`android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699` (v4.0.1) but passed no
`packages` input, so the action used its default of `tools platform-tools` — the run log echoes
the resolved inputs as `packages: tools platform-tools`. `tools` is the obsolete standalone SDK
Tools package that `cmdline-tools` replaced, and Google has retired it from the SDK repository,
so `sdkmanager tools` now exits 1. An environment break, not a code break: it took down every
in-flight commit at once, which is why the dispatcher opened one recovery task per promoted SHA.

Reproduced against a real local SDK at `/home/trinkle/Android`, both directions:

- `cmdline-tools/latest/bin/sdkmanager --sdk_root=/home/trinkle/Android tools` →
  `Warning: Failed to find package 'tools'`, **exit 1** — the runner's exact message and code.
- `cmdline-tools/latest/bin/sdkmanager --sdk_root=/home/trinkle/Android platform-tools` →
  **exit 0**. So `packages: platform-tools` is both necessary and resolvable.

## Reconciliation with the integration branch

The fix had already landed upstream by the time this task was re-entered. `origin/loop/rc` has
advanced 39 commits past this branch's merge base (`83f94aab`) and already carries:

- `31acff8e` `ci(android): stop requesting the retired 'tools' SDK package` — the pin itself.
- `7b2e81de` "test(ci): fail closed when a workflow drops the Android `packages` pin" — the
  regression guard, and the current integration tip.

This branch's **only** commit not on `loop/rc` was `e11d80c4`, an independent duplicate of that
same repair. `git merge-tree --write-tree --name-only origin/loop/rc e11d80c4` exited 1 with
`CONFLICT (content)` in `ci.yml`, `release.yml` and `validate.yml`, because both sides edit the
same three `with:` blocks and differ only in comment wording.

The conflict is resolved in favour of the integration branch: this branch is reset onto
`7b2e81de`, and the superseded candidate is preserved at the local tag
`backup/pre-reconcile-d4729e8f` rather than discarded.

Equivalence was verified, not assumed. `git grep -A4 setup-android@ origin/loop/rc --
.github/workflows/` returns exactly three call sites — `ci.yml:366`, `release.yml:343`,
`validate.yml:88` — and all three carry `packages: platform-tools`. Those are the same three
sites the dropped candidate touched, and there is no fourth site left on the broken default.
Diffing the two commits' workflow hunks shows identical `packages: platform-tools` lines and no
behavioural difference; only the explanatory comment is worded differently. Nothing from the
candidate's workflow diff is worth carrying forward, so this branch modifies no workflow file.

## The retained guardrail is the stronger of the two

The dropped candidate also added its own `ci-guardrails` case. Keeping `loop/rc`'s version is not
merely a tie-break — the retained test is strictly stronger. The candidate's version asserted only
that `packages` is a string and does not contain `tools`; `7b2e81de` additionally asserts
`toContain('platform-tools')`, so silently swapping the pin for some other package is caught
rather than ignored.

Because a green run does not prove a guardrail fails closed, the retained case was mutation-checked
against all three loss shapes. The mutations were applied **out of tree** — a temp directory of
symlinks to the worktree with a real copy of `.github/` only, run with `repoRoot = process.cwd()`
pointed at the mirror — so no tracked file was ever modified. Baseline there: 14 passed.

| Mutation                                                                  | Result              | Message                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Delete the `with:` block from `ci.yml` (restores the broken default)      | 1 failed, 13 passed | ``ci.yml setup-android must pin `packages`: expected 'undefined' to be 'string'``                                          |
| Reinstate `packages: tools platform-tools` in `validate.yml`              | 1 failed, 13 passed | ``validate.yml setup-android requests the retired `tools`: expected [ 'tools', 'platform-tools' ] to not include 'tools'`` |
| Swap `packages: platform-tools` for `packages: emulator` in `release.yml` | 1 failed, 13 passed | ``release.yml setup-android drops `platform-tools`: expected [ 'emulator' ] to include 'platform-tools'``                  |

The third is exactly the case the dropped candidate's weaker assertion missed, which is the
concrete reason the duplicate is not worth reconciling by hand. The mirror was deleted afterwards;
`git status` on the worktree is clean apart from this journal.

## The fix is confirmed green on a real runner

Earlier review of this recovery could only infer the post-fix result from the action's documented
input contract, because the Android jobs cannot run locally. That gap is now closed by
observation: on the integration tip `7b2e81de`, CI run
[35245713599](https://github.com/tsieb/dndtools/actions/runs/35245713599) records
`Android unit, lint, and package checks` as **success** (started 2026-09-17T16:23:34Z). The job
that this task was opened for passes on a GitHub-hosted runner with the pin in place.

## Out of scope, flagged not absorbed

CI on the integration tip is still red, but on a **different** job:
`visual regression (golden routes)`, at `Compare the golden routes with the committed baselines`.
It is not this task's failure, and that is a matter of record rather than judgement — the job did
not exist at `d4729e8f`. It was added later by `dc930290`
(`test(visual): RC-DSN-4.1 golden-route visual regression suite`), which is not an ancestor of
`d4729e8f`; `git grep "golden routes" d4729e8f -- .github/workflows/ci.yml` finds nothing.

That break has its own recovery task, `ci-recovery-7b2e81de`, with a candidate already re-baselining
the nine `/knowledge` PNGs. Re-baselining from here would duplicate that work and push an
unreviewed visual change through a recovery scoped to an SDK package, so it is left alone.

## Validation

On the reconciled tree:

- `pnpm ci:local` — **exit 0, all eight steps PASS**: `gates`, `security:secrets`,
  `format:check:changed`, `lint`, `typecheck`, `build`, `test`, `test:coverage:core`. This
  mirrors the CI `build-and-test` job.
- Unit totals, all passing: core 276 files / 4,830 tests; cloud 38 / 499; app 134 / 1,481;
  tooling 26 / 192.
- Core coverage: statements 89.88%, branches 79.91%, functions 93.16%, lines 94.09%.
- `npx vitest run tests/unit/ci-guardrails.test.ts` — 14 passed, including
  `never asks the Android SDK for the retired 'tools' package`.
- `npx prettier --check state/ci-recovery-d4729e8f.journal.md` — clean, so the changed-files
  format gate stays green on the one file this branch adds.
- Local SDK reproduction, both directions, as recorded under Diagnosis.

The Android jobs themselves still cannot be executed here — no GitHub runner, no emulator — so
the end-to-end proof for this fix is the observed green run on `7b2e81de` cited above, not a
local Gradle invocation.

Nothing was weakened. This branch changes exactly one file — this journal. No workflow, no test,
no assertion, and no source file is touched, so no protection could have been relaxed.
