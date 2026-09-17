# CI recovery for 354e41b9 run journal

## Scope

Repair the `CI` workflow for promoted commit
`354e41b9b1e48f95cd726c573079d02883bb39a6` on the current task branch. Preserve tests and
workflow protections; commit locally. No push, promotion, dispatcher control changes,
additional loop, or additional agents.

## Diagnosis

Push run [35215644526](https://github.com/tsieb/dndtools/actions/runs/35215644526) (and its
PR-event twin 35215649944 on PR #76) has exactly two failing jobs. `build-and-test`,
`accessibility`, `Electron smoke` and all three `browser E2E` shards are green, so nothing in
RC-SES-5.1 itself is implicated.

### 1. `Android unit, lint, and package checks` — dies in 30s at `Set up Android SDK`

```
[command]/usr/local/lib/android/sdk/cmdline-tools/20.0/bin/sdkmanager tools
Warning: Failed to find package 'tools'
Error: The process '.../sdkmanager' failed with exit code 1
```

`android-actions/setup-android@v4.0.1` declares its `packages` input with the default
`'tools platform-tools'`. Google retired the obsolete `tools` package (SDK Tools 26.1.1) and
dropped it from the SDK repository, so the action's own default argument no longer resolves.
The job dies before it installs a single toolchain package — an upstream infrastructure break,
not a regression in `354e41b9`. It fails identically on every commit since 2026-09-16.

`release.yml` and `validate.yml` carry the same unpinned step and are latently broken for the
same reason; they have not gone red only because they have not run since Google dropped the
package.

### 2. `visual regression (golden routes)` — 9 of 135 specs

Every failure is `/knowledge`, 3 viewport tiers x 3 themes, and nothing else. Per-image diffs
in CI: 183, 186, 210, 366, 372, 386, 402, 420, 474 pixels (ratio 0.01 each).

`456b27f4` (RC-KNW-2.2, "note list information scent") swapped the note card's timestamp in
`apps/gm-react/src/screens/knowledge/index.tsx:409` to
`t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })`. The suite pins
the clock to `FIXED_TIME = 2026-03-14T15:30:00Z` (`golden-routes.spec.ts:18`) and, with the
clock fixed, every seeded note shares that instant as its `updatedAt` (the spec says so at
line 39). The absolute form rendered `Mar 14`; the relative form renders a zero delta as `now`.

**Both outputs are deterministic.** The render is not clock-dependent, so this is a stale
baseline, not a flaky assertion, and re-baselining is the repair rather than cover for one.

Verified by cropping the diff rather than trusting the story: on the desktop/tavern capture the
changed region is confined to the six `updated …` runs on the note cards, with no layout shift
anywhere else, and the expected/actual crops read `updated Mar 14` against `updated now`.

## Reproduction

`apps/gm-react/tests/visual/run-in-container.sh` (podman 5.8.4, the CI-pinned
`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…` image) reproduced the visual job
**pixel-for-pixel**: the same nine specs failed with the same nine pixel counts
(183/186/210/366/372/386/402/420/474) that CI reported.

The Android break is an upstream package-repository fact and cannot be reproduced in this
worktree; it is confirmed from the CI log above and from the action's published default.

## Repair

1. **`fix(ci): stop setup-android installing the removed 'tools' package`** — pin
   `packages: platform-tools` on the `setup-android` step in `ci.yml`, `release.yml` and
   `validate.yml`. This _narrows_ what the action installs rather than widening it; the
   explicit `sdkmanager` step that follows in each job is untouched, so every job still builds
   against the same API 36 toolchain. A new `tests/unit/ci-guardrails.test.ts` case fails if
   any `setup-android` step goes back to the default or asks for `tools` again.
   (Cherry-picked from `16809a99` / `e1d5a836`, which a sibling `ci-recovery` task produced
   for the same upstream break.)

2. **`test(visual): re-baseline /knowledge for RC-KNW-2.2's relative timestamp`** — rewrite the
   nine `/knowledge` baselines with
   `run-in-container.sh -g knowledge --update-snapshots=changed`. No spec, tolerance or
   assertion changed; only the committed PNGs.

Nothing was weakened. The pixel tolerance (40 px), `--update-snapshots=none` in CI, the
baseline size budget and every workflow protection are untouched.

## Verification

| Check                                                                         | Result                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `run-in-container.sh -g knowledge` (before)                                   | 9 failed — reproduces CI exactly                                                                                        |
| `run-in-container.sh --update-snapshots=changed -g knowledge`                 | 9 passed, 9 PNGs rewritten                                                                                              |
| `run-in-container.sh --update-snapshots=none` (full suite, the CI invocation) | 135 passed                                                                                                              |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs`                   | 135 files, 12796.0 / 32768.0 KiB                                                                                        |
| `vitest run tests/unit/ci-guardrails.test.ts`                                 | 14 passed                                                                                                               |
| Mutation check: drop `packages:` from `ci.yml`, re-run the guardrail          | **fails** — `ci.yml leaves setup-android on its default packages`, `expected "string", received "undefined"`. Restored. |

The rewritten PNGs came out **byte-identical** to the ones six independent sibling
`ci-recovery` tasks generated on their own branches (`bf0d9667`, `49dbebff`, `eb3c1d4b`,
`6dda32b5`, `097abb1d`, `f903a839` — same three blob hashes
`daff901b…`, `79595779…`, `6c621a0d…`). Seven independent renders agreeing to the byte is
direct evidence the capture is deterministic and that the later RC-SES/RC-UX commits on this
branch move no `/knowledge` pixels.

## Note for the operator

Both repairs have now been produced independently by several `ci-recovery` tasks and **none of
those branches has merged** — `loop/rc` and `main` still carry the unpinned `setup-android`
step and the stale `/knowledge` baselines. The recurrence is a delivery problem, not a
diagnosis problem; re-running this task will keep producing the same two commits.
