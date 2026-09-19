# ci-recovery-14357344d8dd — run journal

Task: repair GitHub CI for promoted commit `14357344d8ddfae416bae65b8a7627599d3364ca`
(`fix(knowledge): keep secret callout tags off the player note card`).
Failing workflow: CI. This is the second pass; the first was returned by the gate with a
rebase conflict in `.github/workflows/{ci,release,validate}.yml`.

## What was red

Run [35153405543](https://github.com/tsieb/dndtools/actions/runs/35153405543) (push) and
[35153411391](https://github.com/tsieb/dndtools/actions/runs/35153411391) (PR) failed two
independent jobs, read from the job list rather than the summary page:

```
X visual regression (golden routes)      in 4m10s   (126 passed, 9 failed)
X Android unit, lint, and package checks in 28s     (died in "Set up Android SDK")
```

The two have separate causes. Only one of them is still this branch's to fix.

## 1. Android SDK setup — already fixed upstream, and the source of the conflict

`android-actions/setup-android` v4.0.1 defaults its `packages` input to
`tools platform-tools`. Google retired the standalone `tools` package, so `sdkmanager`
exits 1 on it — drift underneath a correctly pinned action, which is why the job began
failing with no workflow change. Reproduced locally against the SDK at `/home/trinkle/Android`:
`sdkmanager tools` → `Warning: Failed to find package 'tools'`, exit 1; `sdkmanager
platform-tools` → exit 0.

`loop/rc` already carries this fix, and it is what the returned rebase collided with. Both
sides pin the identical `packages: platform-tools` at the same three call sites and differ
only in comment wording, so git could not auto-merge three adjacent one-line additions.

Resolved in favour of the integration branch, per the standing rule for sibling
`ci-recovery` races. This branch's duplicate (`2b430415`) was dropped during the rebase
rather than merged, and `.github/` is now byte-identical to `origin/loop/rc`:
`git diff HEAD origin/loop/rc -- .github/` is empty.

Nothing is lost by dropping it. Upstream's guardrail (`tests/unit/ci-guardrails.test.ts`,
"never asks the Android SDK for the retired `tools` package") is strictly stronger than the
copy this branch would have added: it also asserts `platform-tools` is still _requested_,
so it fails closed against a rewrite to `packages: emulator` that would strip the
platform-tools the Android jobs need. It passes here, 14/14.

## 2. The nine `/knowledge` golden routes — this branch's actual repair

All nine failures were `/knowledge`, on every layout tier × every theme:

```
visual-desktop | visual-rail | visual-phone   ×   tavern | parchment | high-contrast
```

Cause is `456b27f4` (RC-KNW-2.2), which replaced the note card's absolute
`formatStamp(n.updatedAt, formatDate)` with `formatRelativeTime(new Date(n.updatedAt))`
(`apps/gm-react/src/screens/knowledge/index.tsx:409`) and did not re-baseline the route. It
had no CI run of its own, so the miss first surfaced at `14357344` — whose own secret-tag
fix moves no pixels here, because the fresh first-run seed carries no secret tags.

The rendered delta is exactly `updated Mar 14` → `updated now`, nothing else.

**This is a stale baseline, not a flake, and not a regression being papered over.**
`formatRelativeTime` defaults `now` to `Date.now()`, which the suite freezes via
`page.clock.setFixedTime(2026-03-14T15:30:00Z)`. The seeded notes' `updatedAt` is written
under that same frozen clock, so the delta is exactly 0, lands below the 1000 ms `second`
bucket, and formats as `now`. Deterministic by construction, and the new render is the
intended one — showing relative modification time is the point of the story.

This is the item the previous recovery's journal (`ci-recovery-e86f14db4962`) recorded as
out of its scope and separately owned. It is **not** yet on `loop/rc`: the nine baselines
there still hold the pre-RC-KNW-2.2 bytes, so this re-baseline is the complement of that
pass, not another duplicate of it.

## Verification on the rebased tree

Rebased onto the live integration tip `7b1621e4` (`git merge-base --is-ancestor 7b1621e4 HEAD`
exits 0), so none of this is measured against a stale base. Superseded candidate preserved at
the local branch `backup/pre-rebase-908b30d3`.

`loop/rc` also landed three further `/knowledge` changes after this branch's base
(`35a5c920` RC-UX-4.3 tablet two-pane, `b8dc080e`, `995ec816`), so the baselines were
re-verified against the reconciled tree rather than assumed to still hold.

**The decisive check** — the committed baselines were compared byte-for-byte against CI's
own renderings, downloaded from the failing run's `visual-regression-report` artifact
(id `10470546101`), covering both the first attempt and `-retry1` for all nine tests:

```
18 of 18 `*-actual.png` → cmp IDENTICAL to the committed baseline
```

Full byte equality on every one, with no sub-threshold exception needed. run1 and retry1
agreeing with each other and with the committed bytes also re-confirms the render is stable,
not timing-dependent.

All visual runs used `apps/gm-react/tests/visual/run-in-container.sh` — the pinned
`mcr.microsoft.com/playwright:v1.61.1-noble` image at the digest `ci.yml` pins
(`sha256:5b8f294a…`), the only environment TESTING.md §8 says the baselines describe.

| check                                                               | result                                         |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| golden routes, `-g knowledge`                                       | 9/9 passed                                     |
| golden routes, full suite                                           | 135/135 passed                                 |
| golden routes, full suite with CI's exact `--update-snapshots=none` | 135/135 passed, exit 0                         |
| `check-baseline-budget.mjs`                                         | pass — 135 files, 12,796.0 KiB of 32,768.0 KiB |
| `vitest run tests/unit/ci-guardrails.test.ts`                       | 14/14 passed                                   |
| `pnpm typecheck` (core + cloud-fns + gm-react)                      | exit 0                                         |
| `pnpm lint`                                                         | exit 0                                         |
| `pnpm build`                                                        | exit 0, `check-prod-bundle` OK                 |
| `pnpm test` (critical + cloud + app + tooling)                      | 474 files, 7,002 tests passed                  |
| `pnpm check:android`                                                | preflight passed (static only)                 |

`git status` was empty after each visual run, so no run silently rewrote a baseline. The
final run used `--update-snapshots=none` specifically, not Playwright's default of
`missing`, so a missing baseline would have failed rather than been written.

## Scope and limits

Diff against the integration tip is exactly the nine PNGs:

```
apps/gm-react/tests/visual/__screenshots__/visual-{desktop,rail,phone}/knowledge--{tavern,parchment,high-contrast}.png
```

No test assertion, tolerance or workflow protection was weakened. No workflow file is
touched at all on this pass. The visual job still compares with `--update-snapshots=none`,
the 40-pixel anti-aliasing tolerance is untouched, and the size budget still applies.

What this pass does not prove:

- The Android job's end-to-end proof is a green runner, which needs a push I did not make.
  Upstream's pin is already green on a runner at `d77cbb05` (run `35268656982`); this pass
  adds nothing to that and claims nothing further.
- `pnpm lint` reports pre-existing eslint warnings and an emphasis-baseline ratchet notice
  (`display-face-below-24px` 83 vs baseline 84). Both are inherited from `loop/rc` and
  unchanged by this branch, which touches no source file. Lowering the baseline would be an
  unrelated change, so it was left alone.
- `actionlint` is not installed here and was not run; nothing is claimed from it.

Commit is local to the task branch. Central gates and independent review are the operator's
next steps.
