# ci-recovery-d28fdf69 — run journal

Task: repair GitHub CI for promoted commit `d28fdf69624efa3c0281191bb7aaf72c5eeec025`.
Failing workflow: CI. This is the second pass; the first was returned by the gate with a
rebase conflict in `.github/workflows/{ci,release,validate}.yml`.

## What was red

Run [35179496486](https://github.com/tsieb/dndtools/actions/runs/35179496486) (PR #76) had
two failing jobs; every other job in the workflow was green.

1. **`Android unit, lint, and package checks`** — died in 20s at `Set up Android SDK`:
   `Warning: Failed to find package 'tools'`, then
   `Error: The process '.../sdkmanager' failed with exit code 1`.
2. **`visual regression (golden routes)`** — 9 of 135 specs, all `/knowledge`
   (3 viewports × 3 themes). Per-image diffs: 183, 186, 210, 366, 372, 386, 402, 420, 474
   pixels, ratio 0.01 each.

Diagnosis for both is unchanged from the first pass and is recorded below for the record.
What changed on this pass is that **neither repair is still this branch's to make** —
`loop/rc` landed an equivalent fix for each while this task was out, and those duplicates
are exactly what the returned rebase collided with.

## The reconciliation

Rebased onto `9c637eb0` (the `loop/rc` tip at the time of this pass). Both of this
branch's commits were dropped rather than merged, because each is a content-duplicate of
work already on the integration branch:

| dropped commit                                                                  | superseded by        | evidence                                                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `c5b9f168` `fix(ci): stop setup-android installing the removed 'tools' package` | already on `loop/rc` | all three workflows pin the identical `packages: platform-tools` at the same call sites; the sides differ only in comment wording          |
| `eb3c1d4b` `test(visual): re-baseline /knowledge …`                             | `283580fc`           | all nine baseline PNGs are **byte-identical** — `git rev-parse eb3c1d4b:<path>` equals `git rev-parse origin/loop/rc:<path>` for every one |

After the rebase, `git diff HEAD origin/loop/rc` is empty outside `state/`: `.github/`,
`tests/unit/ci-guardrails.test.ts` and the nine `__screenshots__` PNGs are byte-identical
to the integration branch. Resolved in favour of `loop/rc` per the standing rule for
sibling `ci-recovery` races.

Nothing is lost by dropping either commit:

- The **Android** pin is the same one-line change at the same three call sites, so the
  fix itself is intact. Upstream's guardrail is _stronger_ than the copy this branch
  carried: besides asserting `packages` is pinned and never contains `tools`, it also
  asserts `platform-tools` is still requested, so it fails closed against a rewrite to
  e.g. `packages: emulator` that would strip what the Android jobs need. This branch's
  version checked only the first two.
- The **visual** baselines are the same bytes, so the route is re-baselined either way.
  Those bytes also carry the stronger evidence of the two: the sibling task that landed
  them compared them against CI's _own_ renderings from the failing run's
  `visual-regression-report` artifact (id `10470546101`) and got
  `cmp`-identical on 18 of 18 `*-actual.png` (nine tests × first attempt and `-retry1`),
  with no sub-threshold exception needed. Since this branch's nine PNGs hash equal to
  those, that verification transfers here rather than needing to be redone.

## Diagnosis, retained from the first pass

**Android.** `android-actions/setup-android@v4.0.1` installs `tools platform-tools` when
its `packages` input is unset, and Google dropped the obsolete `tools` (SDK Tools 26.1.1)
package from the SDK repository on 2026-09-16. `sdkmanager` then exits 1 before the job
installs a single toolchain package. This is drift underneath a correctly pinned action —
not a regression in `d28fdf69`; it failed identically on every commit after that date.
Reproduced locally against the SDK on this box, re-run on this pass rather than carried
over — see Verification. Everything the job needs (`platform-tools`, `platforms;android-36`,
`build-tools;36.0.0`, `emulator`, the API 36 system image) is installed by the
`Install Android API 36 toolchain` step that follows, so pinning drops only the dead
package and no capability.

**Visual.** `456b27f4` (RC-KNW-2.2) swapped the note card's timestamp in
`apps/gm-react/src/screens/knowledge/index.tsx` from an absolute `formatStamp` to
`formatRelativeTime(new Date(n.updatedAt))`. The suite pins the clock to
`2026-03-14T15:30:00Z` (`FIXED_TIME`, `golden-routes.spec.ts:18`), and under that fixed
clock every seeded note's `updatedAt` is that same instant — so the absolute form rendered
`Mar 14` and the relative form renders a zero delta as `now`. Both outputs are
deterministic, so this was a **stale baseline, not a flaky assertion**, and re-baselining
is the repair rather than cover for one. Confirmed by cropping the diff rather than
trusting the story: the changed region on the desktop/tavern capture is a single
`683x167+356+269` box, and the expected/actual crops read `updated Mar 14` against
`updated now` with no layout shift.

## What was not weakened

`UPDATE_SNAPSHOTS` still defaults to `none`, so CI keeps failing on any diff or missing
baseline. No assertion, timeout, threshold or workflow protection was relaxed. This pass
removed no test and added no skip; it only dropped two duplicate commits in favour of the
integration branch's copies, one of which is the stricter of the two.

## Verification on the rebased tree

- `pnpm vitest run tests/unit/ci-guardrails.test.ts` → **14 passed**.
- Mutation check on the retained (upstream) Android guardrail: deleting the `with:` block
  from `ci.yml`'s `setup-android` step turns it red with
  `ci.yml setup-android must pin \`packages\`: expected 'undefined' to be 'string'`, and
  green again once restored. The test catches the exact break in the failed CI log.
- Golden-route visual suite in the pinned Playwright container
  (`run-in-container.sh --update-snapshots=none`, image digest matching the
  `visual-regression` job): **135 passed / 0 failed**, no retries, no files written.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 135 files, 12796.0 of
  32768.0 KiB — inside the budget CI enforces as its own step.
- The Android cause re-checked against the live SDK on this box
  (`/home/trinkle/Android/cmdline-tools/latest/bin/sdkmanager`), this pass, not carried
  over from the first: `--install tools` → `Warning: Failed to find package 'tools'`,
  exit 1; `--install platform-tools` → exit 0. So the retired package and the pinned
  replacement both behave as the fix assumes.
- `pnpm ci:local`: exit 0 — gates, security:secrets, format:check:changed, lint,
  typecheck, build, test, test:coverage:core all PASS.

The full Android _job_ still cannot run here — this box has the SDK but not the runner's
Gradle/emulator image — so the workflow change itself rests on the guardrail test plus the
sdkmanager reproduction above; the central operator's gate covers the real job.
