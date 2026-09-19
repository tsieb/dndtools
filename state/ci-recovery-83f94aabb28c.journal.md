# ci-recovery-83f94aabb28c run journal

## Scope

Repair GitHub CI for promoted commit `83f94aabb28cf188630d30e56f9d301d2773fb26`
(`style(design): RC-DSN-3.4 format Skeleton.jsx for the changed-files gate`). Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify the integration candidate without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA and both runs failed the **same single job**:

- [35086099665](https://github.com/tsieb/dndtools/actions/runs/35086099665)
- [35086095966](https://github.com/tsieb/dndtools/actions/runs/35086095966)

`Android unit, lint, and package checks` is the only failure in either run. The other workflows on
the same SHA both succeeded — `Performance` (35086099586) and `Supply Chain` (35086099560). The
failure is one job wide and unrelated to the promoted commit's subject: `83f94aab` is a Prettier
formatting commit on `Skeleton.jsx` and touches no Android code.

The job died in `Set up Android SDK`, before Gradle started. From
`gh run view 35086099665 --log-failed`:

```
packages: tools platform-tools
...
Warning: Failed to find package 'tools'
Error: The process '.../cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1
```

Root cause: the workflows pin
`android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699` (v4.0.1) but passed no
`packages` input, so the action fell back to its default of `tools platform-tools` — the runner log
echoes that exact default back. `tools` is the obsolete standalone SDK Tools package that
`cmdline-tools` replaced, and Google has retired it from the SDK repository, so `sdkmanager tools`
now exits 1. This is an environment break rather than a code break, which is why it took down every
in-flight commit at once and the dispatcher opened one recovery task per promoted SHA.

Reproduced against the real local SDK at `/home/trinkle/Android`, in both directions, using a
scratch `--sdk_root` so the repro could not disturb the host SDK:

- `sdkmanager --sdk_root=/tmp/sdkrepro-83f94aab tools platform-tools` — the exact package list the
  action requests — printed `Warning: Failed to find package 'tools'` and exited **1**, matching
  the runner byte for byte.
- `sdkmanager --sdk_root=/tmp/sdkrepro-83f94aab platform-tools` exited **0** and materialised
  `/tmp/sdkrepro-83f94aab/platform-tools/adb` (10,642,368 bytes, platform-tools r37.0.1). So
  `packages: platform-tools` is both necessary and still resolvable.

The scratch SDK root was deleted after the repro.

## Reconciliation with the integration branch

The repair was already upstream by the time this task was re-entered. The promoted commit's own
code is on the integration branch already: `git merge-base --is-ancestor 83f94aab eebdf036`
succeeds. `origin/loop/rc` (tip `eebdf036`) already carries:

- `31acff8e` `ci(android): stop requesting the retired 'tools' SDK package` — the pin itself.
- `7b2e81de` "test(ci): fail closed when a workflow drops the Android `packages` pin" — the
  regression guard.
- `75053859`, `ae335601`, `830b7382` and `eebdf036` — four sibling recoveries' journals.

This branch's only commits not on `loop/rc` were `0ab5ed75`, an independent duplicate of the same
repair (`packages: platform-tools` at the same three call sites, differing only in comment
wording), and `d6f49436`, its journal. The branch was cut before `31acff8e` integrated and never
picked it up. Read-only `git merge-tree --write-tree --name-only origin/loop/rc d6f49436` exited 1
with `CONFLICT (content)` in `.github/workflows/ci.yml`, `release.yml` and `validate.yml` — the
same three paths the gate feedback reported. Both sides edit the same three `with:` blocks, so
integrating the duplicate would cost manual conflict resolution and change no behaviour.

The conflict is resolved in favour of the integration branch: this branch is reset onto
`eebdf036`, and the superseded candidate is preserved at the local tag
`backup/pre-reconcile-83f94aabb28c` (`d6f49436`) rather than discarded. The superseded journal at
`docs/development/run-journals/ci-recovery-83f94aab.md` is dropped with it — that path is not the
repo's convention; the sibling recoveries all write `state/ci-recovery-<sha>.journal.md`, which is
what this journal uses.

Equivalence was verified rather than assumed. On the reset tree,
`git grep -n setup-android@ -- .github/workflows/` returns exactly three call sites — `ci.yml:366`,
`release.yml:343`, `validate.yml:88` — and all three carry `packages: platform-tools`. Those are
the same three sites the dropped candidate touched, so nothing the candidate fixed is lost.

## Verification

Run from the reset worktree at `eebdf036`:

- `pnpm vitest run tests/unit/ci-guardrails.test.ts` — 14/14 pass, including
  "never asks the Android SDK for the retired `tools` package".
- `pnpm test:tooling` — 26 files, 192/192 pass.
- `pnpm audit:repo` — 14/14 pass.

A green guardrail alone does not prove it fails closed, so `7b2e81de`'s guard was mutation-checked
again on this tree, against both loss shapes:

- Restoring `packages: tools platform-tools` in `ci.yml` fails the retired-package assertion
  (1 failed | 13 passed):

  ```
  AssertionError: ci.yml setup-android requests the retired `tools`:
  expected [ 'tools', 'platform-tools' ] to not include 'tools'
  ```

- Deleting the `with:` block entirely — the likelier regression, and the one a value-only assertion
  would miss — fails the presence assertion (1 failed | 13 passed):

  ```
  AssertionError: ci.yml setup-android must pin `packages`:
  expected 'undefined' to be 'string'
  ```

`ci.yml` was restored after each mutation; `git diff` and `git status` are both empty, so the tree
is byte-identical to `eebdf036`.

`actionlint` is not installed on this host, so the workflow-syntax check was not run here; the
workflow files are unmodified by this branch, so it has nothing new to inspect.

## Outcome

No workflow or test change is carried by this branch. The reported failure's fix is already on the
integration branch, verified present and verified failing closed. The only commit is this journal.
No gate, assertion or workflow protection was weakened.
