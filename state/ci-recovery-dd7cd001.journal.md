# ci-recovery-dd7cd001 run journal

## Scope

Repair GitHub CI for promoted commit `dd7cd0012b4c` (`docs(run-journal): record the full browser-suite
result for RC-ENG-6.2`). Failing workflow: CI (run `35209917826`, push to `loop/rc`). Owned paths: `*`.
No push, no promotion, no dispatcher mutation, no agents.

## What was actually red

Two independent jobs, neither caused by `dd7cd001` itself:

1. **`Android unit, lint, and package checks`** — died 27s in at `Set up Android SDK`:
   `Warning: Failed to find package 'tools'` →
   `Error: The process '.../cmdline-tools/20.0/bin/sdkmanager' failed with exit code 1`.
2. **`visual regression (golden routes)`** — nine `/knowledge` captures (3 viewports × 3 themes)
   differed by a single text run each, 386–474 px per image. Nothing else in the job failed.

Both are recurrences of already-diagnosed drift, not defects in the promoted commit. The
Android one is registry drift (Google removed the obsolete `tools` / SDK Tools 26.1.1 package from
the SDK repository on 2026-09-16, and `android-actions/setup-android` installs
`tools platform-tools` when its `packages` input is unset). The visual one is a stale baseline
left behind when RC-KNW-2.2 switched the note card from `formatStamp` (absolute, `updated Mar 14`)
to `formatRelativeTime` (`updated now` against the suite's pinned `FIXED_TIME`); both forms are
deterministic, so re-baselining repairs the gate rather than weakening it.

When this branch was cut (base `354e41b9`) neither fix was on `loop/rc`. Both landed there while
it was in flight — see the reconciliation section below.

## Reproduction

- Android, against the local SDK at `/home/trinkle/Android`, no GitHub involved:
  - `sdkmanager tools` → `Warning: Failed to find package 'tools'`, **exit 1** (identical to CI).
  - `sdkmanager platform-tools` → **exit 0**. So the pin drops only the dead package.
- Visual: `apps/gm-react/tests/visual/run-in-container.sh` runs the suite in the image pinned to
  CI's digest and reproduces the job pixel-for-pixel.

## Change

Cherry-picked the two existing fixes rather than re-authoring conflicting duplicates. Both applied
cleanly onto `354e41b9`.

- `git cherry-pick -x e1d5a836` → `16809a99` — pins `packages: platform-tools` on all three
  `setup-android` steps (`ci.yml`, `release.yml`, `validate.yml`) and brings the
  `tests/unit/ci-guardrails.test.ts` case that fails if any of them goes back to the default or asks
  for `tools` again. Re-authoring the workflow edit by hand would silently lack that guardrail.
- `git cherry-pick -x 49dbebff` → `f903a839` — re-baselines the nine `/knowledge` PNGs. Binary only;
  no spec, threshold or assertion changed.

## Verification

- Golden-route visual suite, full, in the pinned container at `--update-snapshots=none`:
  **135 passed (2.4m)**, and the working tree stayed clean afterwards — nothing was silently
  rewritten. The nine previously-failing `/knowledge` captures are among the passes.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` → `135 files, 12796.0 KiB of 32768.0 KiB`,
  exit 0. CI enforces this as its own step.
- `tests/unit/ci-guardrails.test.ts` → 14 passed. **Mutation-checked**: flipping `ci.yml` back to
  `packages: tools platform-tools` fails the new case — the assertion reports that `ci.yml` still
  requests the removed `tools` package. Reverted immediately. A green tooling run alone would not
  prove it fails closed.
- `pnpm lint` → 0 (emphasis counters unchanged from baseline aside from the pre-existing
  `display-face-below-24px 83 vs baseline 84` advisory, which predates this branch).
- `pnpm typecheck` → 0. `pnpm build` → 0, including `check-prod-bundle`.
- `pnpm test` → 0: 276+38+134+26 files, 4830+499+1481+192 tests, all passing.

The Android job itself cannot be run locally — it needs the hosted runner's SDK and a KVM emulator —
so the evidence for it is the exact-match local `sdkmanager` reproduction plus the guardrail's
mutation check, not a green job.

## Gate feedback (first attempt, `516c8e04`)

`Format (changed)` failed on this journal alone — `pnpm format:check:changed --base loop/rc` warned
on `state/ci-recovery-dd7cd001.journal.md`. The cause was a quoted assertion message wrapped across
two lines inside a single inline code span; Prettier's fix de-indents the continuation line, which
reads worse than the original. Reworded the bullet so the quote no longer spans lines instead of
accepting that reflow. Re-ran the gate's exact invocation: 5 changed files, all clean, exit 0. No
code, workflow or baseline changed — `16809a99` and `f903a839` are byte-identical, so the gate
results recorded above still stand.

## Reconciliation with `loop/rc` (second gate feedback, `acea63fe`)

Independent review found the candidate could not merge: `origin/loop/rc` (`a967a64d`, now `67d9ac69`)
already carries both repairs — the Android pin as `31acff8e` with its guardrail `7b2e81de`, and the
nine `/knowledge` baselines as `283580fc`. `git merge-tree --write-tree origin/loop/rc acea63fe`
conflicted in `ci.yml`, `release.yml` and `validate.yml` (same `packages: platform-tools` line,
different comment above it), and `tests/unit/ci-guardrails.test.ts` auto-merged into two tests
asserting the same thing.

Merged `origin/loop/rc` into this branch and resolved every overlap in its favour, per the standing
rule for sibling ci-recovery races:

- The three workflows take `loop/rc`'s version verbatim.
- `tests/unit/ci-guardrails.test.ts` takes `loop/rc`'s version verbatim, so only its
  "never asks the Android SDK for the retired `tools` package" case remains. This branch's
  near-duplicate is dropped; the kept case asserts the same two things (no `tools`, has
  `platform-tools`) on every `setup-android` step.
- The `/knowledge` PNGs from `f903a839` are byte-identical to `283580fc`, so the merge adds nothing
  there.

After the merge, `git diff origin/loop/rc` touches only this journal. Everything else on the branch
is now a no-op against the integration branch.

`loop/rc` CI evidence: push run `35286320709` on `a967a64d` is green, including the Android job and
the golden-route visual job. The `pull_request` run on the same SHA (`35286323232`) failed in
Android emulator acceptance at "Back did not cancel the Android share/save sheet". That is past
`Set up Android SDK`, so it is not the `tools` failure. The push run on the identical SHA passed,
so I recorded it as an emulator flake and left it out of scope here.

Post-merge checks (on the merge result):

- `npx vitest run tests/unit/ci-guardrails.test.ts` → 14 passed.
- Mutation check on the kept guardrail: setting `ci.yml` back to `packages: tools platform-tools`
  fails it. Reverted immediately.
- `pnpm format:check:changed -- --base origin/loop/rc` → clean, exit 0.

## Not done

Nothing was pushed or promoted. This branch can be merged cleanly or closed as superseded. Its only
remaining content is this record.
