# ci-recovery-a91319f5 — Repair GitHub CI for a91319f565b6

## Failure

CI run `35227551638` (push, `loop/rc`) and its PR sibling `35227559316` failed on `a91319f5`
with **two independent causes**. `build-and-test`, all three browser E2E shards, accessibility,
Electron and Performance were green, so nothing here is a code regression from the promoted
commit — both breaks predate it.

1. **`Android unit, lint, and package checks`** failed in 27s at `Set up Android SDK`, before a
   line of repo code was built:

   ```
   [command]/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager tools
   Warning: Failed to find package 'tools'
   Error: The process '.../sdkmanager' failed with exit code 1
   ```

2. **`visual regression (golden routes)`** failed 9 of 135 tests — `/knowledge` in all three
   themes on all three layout tiers — with ~380–400 differing pixels each:

   ```
   386 pixels (ratio 0.01 of all image pixels) are different.
   Snapshot: knowledge--tavern.png
   ```

## Cause 1 — the Android SDK's `tools` package no longer exists

`android-actions/setup-android` v4.0.1 declares an input `packages` whose default is
`'tools platform-tools'`, and none of the three workflows set it. Verified against the pinned
action itself:

```
$ curl -s https://raw.githubusercontent.com/android-actions/setup-android/40fd30fb.../action.yml
  packages:
    description: 'Additional packages to install'
    default: 'tools platform-tools'
```

Google retired the obsolete `tools` package and dropped it from the live SDK repository, so the
action's own default argument no longer resolves. Verified against Google's index:

```
$ curl -s https://dl.google.com/android/repository/repository2-3.xml | grep -c 'path="tools"'
0
$ ... | grep -c 'path="platform-tools"'
1
```

Reproduced locally with the SDK on this machine — the CI message verbatim:

```
$ sdkmanager --sdk_root=$ANDROID_HOME tools           → Warning: Failed to find package 'tools'   exit 1
$ sdkmanager --sdk_root=$ANDROID_HOME platform-tools  →                                           exit 0
```

**Fix:** pin `packages: platform-tools` on the `setup-android` step. This _narrows_ what the
action installs rather than widening it; the explicit `Install Android API 36 toolchain`
sdkmanager step that follows in each job is untouched, so the jobs still build and test against
the same API 36 toolchain. No protection is relaxed.

All three workflows carried the same latent break, so all three are fixed. `validate.yml` and
`release.yml` had not gone red yet only because they had not run since Google dropped the package.

Nothing in the tree asserted the pin, so a later edit could drop the `with:` block and take every
Android job down again with no code change to blame. `tests/unit/ci-guardrails.test.ts` now walks
every workflow and requires each `setup-android` step to set `packages` explicitly without listing
`tools`. The case is taken verbatim from the sibling `ci-recovery-a030055e` branch (`e1d5a836`) so
the two converge rather than conflict if that branch lands first.

## Cause 2 — the `/knowledge` golden baselines predate RC-KNW-2.2

`456b27f4` (RC-KNW-2.2, "add note list information scent") replaced the note card's absolute
stamp with a relative one in `apps/gm-react/src/screens/knowledge/index.tsx`:

```
- {t('knowledge.updated', { when: formatStamp(n.updatedAt, formatDate) })}
+ {t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}
```

The last baseline rewrite (`e86f14db`) re-baselined only `/board`, `/scene/:id` and `/settings`,
so the `/knowledge` baselines were never brought forward and still describe the pre-RC-KNW-2.2
card. The suite pins the clock (`page.clock.setFixedTime('2026-03-14T15:30:00Z')`), so this is a
stale baseline, not a flake — it reproduces identically every run.

Confirmed by decoding the failure artifacts rather than inferring: cropping the diff bounding box
out of `-expected.png` and `-actual.png` shows the note cards are pixel-identical except for the
stamp line, `updated Mar 14` → `updated now`. Every seeded note is written at the pinned instant,
so `formatRelativeTime` correctly renders "now". The new rendering is the intended one.

**Fix:** re-baseline the nine `/knowledge` goldens inside the pinned Playwright image. The
assertion itself is unchanged — still a strict full-page pixel comparison at the same threshold,
now against the current intended rendering. No threshold, mask or `maxDiffPixels` was introduced.

The rewrite is scoped: exactly 9 files changed, and each new baseline differs from its committed
predecessor by the same pixel count and the same bounding box that CI reported, so nothing outside
the timestamp moved.

| project        | changed px | bbox               |
| -------------- | ---------- | ------------------ |
| visual-desktop | 1112–1120  | x355-1038 y269-435 |
| visual-rail    | 1128–1134  | x155-553 y273-596  |
| visual-phone   | 564–567    | x77-111 y315-638   |

## Validation (repo root, on this branch's head)

Each command's original output was read for its exit status.

- **Reproduced before fixing.** `apps/gm-react/tests/visual/run-in-container.sh -g knowledge`
  against the committed baselines: **9 failed**, the exact nine CI reported (3 themes ×
  `visual-desktop` / `visual-rail` / `visual-phone`). This is also the mutation check: restore the
  old baselines and the suite goes red again on the reported assertion, so it is not vacuously
  green.
- `apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none` — the full suite the
  `visual-regression` job runs, in the same pinned image
  (`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…`): exit 0, **135 passed (2.3m)**.
  126 + 9 = 135 matches the failing run's tally, so every previously-passing route still passes.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` — the job's other step: exit 0,
  135 files, 12796.0 KiB of 32768.0 KiB.
- `pnpm test:tooling tests/unit/ci-guardrails.test.ts` — exit 0, 14 passed.
- **Mutation check on the new guardrail**, both regression shapes, each run against this branch and
  then reverted: restoring the action's `tools platform-tools` default fails on `ci.yml still
requests the removed 'tools' package`; deleting the `with:` block outright fails on `ci.yml leaves
setup-android on its default packages`. So it fails closed rather than passing vacuously.
- `pnpm gates` — exit 0 (6 gates owned and wired; docs check 254 files / 283 links).
- `pnpm format:check:changed` — the `build-and-test` step — exit 0.
- `npx prettier --check` on the three edited workflows — clean.
- All three workflows re-parsed with `yaml.safe_load` after editing (ci 8 jobs, validate 2,
  release 4).
- The Android job cannot be executed off a GitHub runner. Its root cause was instead reproduced
  directly against the failing tool, as shown above, and the fix verified against Google's live
  package index and the pinned action's declared default.
- `build-and-test`, the three E2E shards, accessibility, Electron and Performance were already
  green on `a91319f5` and are untouched by this change.

## Notes

- No test, threshold or workflow protection was weakened. No source file under
  `apps/gm-react/src/` or `packages/core/` was touched.
- The `Unexpected any` annotations on `apps/gm-react/src/app/compendium/open5e.ts:157,178` are
  lint **warnings** on a job that passed; they are pre-existing and out of scope here.
- Sibling `ci-recovery-*` tasks have produced equivalent fixes for both causes on their own
  branches; none had reached `loop/rc` when this branch was cut (`git show origin/loop/rc` still
  had the bare `setup-android` step and the stale baselines), so this branch fixes both itself.
  If a sibling lands first, resolve in favour of the integration branch.
- No push, promotion, loop launch, or dispatcher control-state edits.

## Reconciliation with `loop/rc` (`8b425ae6`)

The gate's rebase onto `8b425ae6` conflicted in `ci.yml`, `release.yml` and `validate.yml`.
By then both causes had already been fixed on the integration branch by sibling recoveries:

- the `packages: platform-tools` pin in all three workflows (`31acff8e`) and its guardrail in
  `tests/unit/ci-guardrails.test.ts` (`7b2e81de`);
- the nine `/knowledge` re-baselines (`283580fc`). `git diff 81c117cc 8b425ae6 --
apps/gm-react/tests/visual` is empty, so this branch's PNGs were byte-identical to what landed.

Replaying this branch's three code commits would only duplicate those fixes and re-conflict, so
the branch was rebuilt on `8b425ae6` and carries this journal alone. Resolved in favour of the
integration branch; nothing of the integration branch's fixes was altered. The superseded
commits were `63268244`, `baff5510`, `a7d0eacb` and `81c117cc`.

Verified on `8b425ae6`:

- `pnpm test:tooling tests/unit/ci-guardrails.test.ts` — exit 0, 14 passed.
- Mutation check of the landed guardrail: changing `ci.yml`'s pin back to
  `tools platform-tools` fails `never asks the Android SDK for the retired 'tools' package`
  (1 failed | 13 passed); reverted.
- `apps/gm-react/tests/visual/run-in-container.sh -g knowledge` in the pinned image — 9 passed.
- All three workflows parse with `yaml.safe_load` (ci 8 jobs, release 4, validate 2), each with
  `packages: platform-tools` on its `setup-android` step.
