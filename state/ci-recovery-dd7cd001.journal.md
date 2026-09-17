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

Neither fix has ever reached `loop/rc` — the recovery branches are not the thing that gets
promoted — so every new promoted commit inherits both failures.

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

## Not done

Nothing was pushed or promoted. The underlying recurrence only stops when one of these recovery
branches actually lands on `loop/rc`; that is the user's merge to make.
