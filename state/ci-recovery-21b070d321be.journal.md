# ci-recovery-21b070d321be run journal

## Scope

Repair GitHub CI for promoted commit `21b070d321bef893a7270e565e4a9560ad2a8b92`
(`fix(char-builder): RC-CHR-5.2 bring the builder back under the emphasis ratchet`). Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify against the integration candidate
without weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA and both runs failed:

- [35111184541](https://github.com/tsieb/dndtools/actions/runs/35111184541) (push)
- [35111190842](https://github.com/tsieb/dndtools/actions/runs/35111190842) (pull_request)

Exactly one job is red in either run — `Android unit, lint, and package checks`, dead at the
`Set up Android SDK` step before Gradle ever starts. Every other job on the SHA is green:

```
success  detect runtime changes
success  build-and-test
success  browser E2E (1-of-3)   success  browser E2E (2-of-3)   success  browser E2E (3-of-3)
success  accessibility (desktop + mobile)
failure  Android unit, lint, and package checks   <- Set up Android SDK
success  Electron smoke (Linux)
```

The separate `Performance` (35111190645) and `Supply Chain` (35111190690) workflows both passed.
The failure is one job wide and unrelated to the promoted commit's subject, which touches the
character builder only.

Root cause: the workflows pinned `android-actions/setup-android@40fd30fb` (v4.0.1) but passed no
`packages` input, so the action fell back to its default of `tools platform-tools`. `tools` is the
obsolete standalone SDK Tools package that `cmdline-tools` replaced, and Google has retired it from
the SDK repository, so `sdkmanager tools` now exits 1. This is an environment break rather than a
code break, which is why it took down every in-flight commit at once and the dispatcher opened one
recovery task per promoted SHA.

## Local reproduction

Reproduced against the real local SDK at `/home/trinkle/Android`, using a scratch `--sdk_root` so
the repro could not disturb the host SDK:

| Command (scratch sdk_root)                                                            | Exit  | Result                                                                    |
| ------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------- |
| `sdkmanager tools platform-tools`                                                     | **1** | `Warning: Failed to find package 'tools'` — the runner's message verbatim |
| `sdkmanager platform-tools` (licenses accepted)                                       | **0** | installed `platform-tools/adb`, 10,642,368 bytes, `Pkg.Revision=37.0.1`   |
| `sdkmanager tools platform-tools` (licenses accepted, platform-tools already present) | **1** | same warning, same exit                                                   |

The third row is the control that matters. The first run exited 1 without accepting licenses, which
on its own would not distinguish "package is gone" from "license prompt declined". Re-running the
same package list with licenses accepted and `platform-tools` already installed still exits 1 with
the same warning, so the failure is attributable to the `tools` package alone and to nothing about
licensing or the environment. The scratch SDK root was deleted after the repro.

## Reconciliation with the integration branch

The repair was already upstream by the time this task was re-entered, which is what the gate
feedback's rebase conflict was reporting. The promoted commit's own code is on the integration
branch: `git merge-base --is-ancestor 21b070d321be origin/loop/rc` exits 0. `origin/loop/rc`
(tip `5a2237f3`) already carries:

- `31acff8e` `ci(android): stop requesting the retired 'tools' SDK package` — the pin itself, at all
  three `setup-android` call sites.
- `7b2e81de` "test(ci): fail closed when a workflow drops the Android `packages` pin" — the
  regression guard.

This branch's only commit not on `loop/rc` was `b7686b6a`, an independent duplicate of that same
repair (`packages: platform-tools` at the same three call sites, differing only in comment wording)
plus a weaker copy of the same guardrail and its journal. The branch was cut at `21b070d3` and never
picked up `31acff8e`. Read-only `git merge-tree --write-tree --name-only origin/loop/rc HEAD` exited
1 with `CONFLICT (content)` in `.github/workflows/ci.yml`, `release.yml` and `validate.yml` — the
same three paths the gate feedback named. Both sides edit the same three `with:` blocks, so
integrating the duplicate would cost manual conflict resolution and change no behaviour.

The conflict is resolved in favour of the integration branch: this branch is reset onto `5a2237f3`
and the superseded candidate is preserved at the local tag `backup/pre-reconcile-21b070d321be`.

Dropping the duplicate loses no coverage, and that was checked rather than assumed:

- On the reset tree, `git grep -n setup-android@ -- .github/workflows/` returns exactly three call
  sites — `ci.yml:366`, `release.yml:343`, `validate.yml:88` — and all three carry
  `packages: platform-tools`. Those are the same three sites the dropped candidate touched.
- The upstream guardrail is **stronger** than the dropped one, not merely equivalent. Both assert
  that `packages` is pinned and does not contain `tools`; `7b2e81de` additionally asserts that
  `platform-tools` is still requested, a loss shape the dropped candidate would have missed.

## Verification

Run from the reset worktree at `5a2237f3`:

- `pnpm vitest run tests/unit/ci-guardrails.test.ts` — 14/14 pass, including "never asks the Android
  SDK for the retired `tools` package".
- `pnpm audit:repo` — 14/14 pass.
- `pnpm test:tooling` — 26 files, 192/192 pass.
- `pnpm gates` — exit 0; 6 gates owned, budgeted and wired, 255 docs reachable. The only output is
  pre-existing `file-size-warn` notices (warn-only, RC-STB-2.7), unchanged from `loop/rc`.

A green guardrail does not prove it fails closed, so the retained upstream guard was mutation-checked
on this tree against all three loss shapes:

| Mutation                                           | Result                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`: restore `packages: tools platform-tools` | FAIL (1 failed \| 13 passed) — ``ci.yml setup-android requests the retired `tools`: expected [ 'tools', 'platform-tools' ] to not include 'tools'`` |
| `ci.yml`: delete the `with:` block entirely        | FAIL (1 failed \| 13 passed) — ``ci.yml setup-android must pin `packages`: expected 'undefined' to be 'string'``                                    |
| `validate.yml`: `packages: emulator`               | FAIL (1 failed \| 13 passed) — ``validate.yml setup-android drops `platform-tools`: expected [ 'emulator' ] to include 'platform-tools'``           |

The third mutation deliberately targets a different workflow file than the first two, confirming the
guard walks every workflow rather than only `ci.yml`. Each file was restored after its mutation;
`git status --porcelain` is empty afterwards, so the tree is byte-identical to `5a2237f3`.

The upstream fix is confirmed green on a real runner, not merely locally: on `7b2e81de`
([35245713599](https://github.com/tsieb/dndtools/actions/runs/35245713599)) the
`Android unit, lint, and package checks` job **passes**, where it failed on every commit before the
pin. That is the job this task was opened for.

`actionlint` is not installed in this environment and is not a package.json script, so it was not
run here and nothing is claimed from it. The workflow files on this branch are byte-identical to
`loop/rc`, which exercises them on every run, so no local linter adds signal over that.

## Limits worth stating

`loop/rc` is still red, but on a different job than the one this task reports. The most recent
completed CI run on the integration branch (35264985380, `26cf41b3`) fails only
`visual regression (golden routes)`, at the "Compare the golden routes with the committed baselines"
step. That is the known, separately-tracked `/knowledge` re-baseline item (RC-KNW-2.2
`formatRelativeTime` rendering "updated now" instead of a fixed date under the pinned clock). It has
its own owner, predates this branch, and was never scheduled on `21b070d3` at all. Re-baselining
those PNGs on a dispatch branch has already been attempted repeatedly without integrating, so this
task does not add another duplicate attempt. The operator should expect that job red on this
candidate for reasons predating it.

## Outcome

No workflow or test change is carried by this branch. The reported failure's fix is already on the
integration branch, verified present at all three call sites, verified failing closed under three
mutations, and verified green on a runner. The only commit is this journal. No gate, assertion or
workflow protection was weakened.
