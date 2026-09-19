# CI recovery for 524fc4d02981 run journal

## Scope

Repair the reported CI failure for promoted commit
`524fc4d0298125014b94841a0be8982551f6fdc9`, which is also the current `origin/loop/rc` tip, on this
task branch. No push, promotion, dispatcher control change, additional loop, or additional agents.

## Diagnosis

Read from GitHub rather than inferred. CI run
[35270002931](https://github.com/tsieb/dndtools/actions/runs/35270002931) on the promoted commit
has exactly one red job, `visual regression (golden routes)`, failing at "Compare the golden routes
with the committed baselines" with `9 failed, 126 passed`. Every other job on the SHA is green —
`build-and-test`, all three browser E2E shards, `accessibility`, `Electron smoke` and
`Android unit, lint, and package checks`, the last of which was the subject of the five preceding
recovery tasks and is now green on a runner.

The nine failures are the same nine every time: `/knowledge` in all three themes on all three
viewport projects.

    [visual-desktop|visual-rail|visual-phone] × [tavern|parchment|high-contrast] › /knowledge

Root cause, established from the pixels rather than from the test name. `456b27f4`
(`feat(knowledge): RC-KNW-2.2 add note list information scent`, an ancestor of this tip) replaced
the note card's absolute stamp with a relative one:

    -  {t('knowledge.updated', { when: formatStamp(n.updatedAt, formatDate) })}
    +  {t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}

The golden suite pins the clock to `2026-03-14T15:30:00Z` and seeds a fresh vault, so every seeded
note's `updatedAt` is that same instant and `formatRelativeTime` renders `now`. Cropping the CI
`-actual` against the CI `-expected` shows precisely that and nothing else: `updated Mar 14` became
`updated now` on every card. RC-KNW-2.2's own journal records that it ran the knowledge E2E suite,
`test:app` and typecheck, but not the container visual suite, so the nine PNGs were never
re-baselined with the change that moved them. The baselines are stale, not flaky, and the product
change is the intended one.

## Reproduced locally

`apps/gm-react/tests/visual/run-in-container.sh -g '/knowledge'` in the pinned
`mcr.microsoft.com/playwright:v1.61.1-noble` image (digest as pinned in `ci.yml`) reproduces all
nine failures at this tree, and — the part worth checking rather than assuming — the renders it
produces are byte-identical to CI's own. Every one of the nine local `-actual.png` files `cmp`s
equal to the corresponding `-actual.png` in CI's `visual-regression-report` artifact. The local
container is therefore the same rendering environment the baselines describe, so a baseline written
here is what CI will compare against.

## Fix

`run-in-container.sh -g '/knowledge' --update-snapshots=changed` rewrote exactly nine files and
nothing else (`git status` lists nine modified PNGs under
`apps/gm-react/tests/visual/__screenshots__/`). No source, test, config or workflow file is touched.

The rewritten baselines were checked against CI, not just re-run locally. Each of the nine is
byte-identical (`cmp`) to the `-actual.png` CI rendered for that capture in run **35270002931, the
run on the promoted commit itself**, and also to the corresponding artifact from run
[35267533844](https://github.com/tsieb/dndtools/actions/runs/35267533844) on `278cb9eb`. The only
diff between `278cb9eb` and this tip is two `state/*.journal.md` files, so nothing pixel-affecting
moved between the two runs.

Each rewritten PNG was opened, as TESTING.md §8 requires. The old-vs-new pixel diff is confined to
one narrow band per image — `x[355..1038] y[269..435]` on desktop, `x[155..553] y[273..596]` on
rail, `x[77..111] y[315..638]` on phone — and side-by-side crops confirm the change is the
timestamp text alone. Card titles, excerpts, icons, visibility chips and layout are unchanged.

## The one non-determinism found, measured not waved off

Across five independent renders of `visual-desktop/knowledge--tavern.png` (CI run 35267533844
attempt 1 and retry 1, CI run 35270002931 attempt 1 and retry 1, and the local container run), four
are byte-identical and one — run 35267533844 attempt 1 — differs by 22 raw pixels at
`x[751..1064] y[29..44]`, the search field's placeholder and `⌘K` hint in the app bar. It is
anti-aliasing jitter, not content: both attempts of that run reported the _same_ thresholded count
(386 differing pixels) against the old baseline, so all 22 fall under `toHaveScreenshot`'s default
per-pixel threshold of 0.2 and score zero. Against `maxDiffPixels: 40` that leaves the full budget
intact even in the worst case. It is pre-existing, lives in the shared app bar rather than in
`/knowledge`, and is not introduced by this change; recorded here rather than chased.

## Verification

- `run-in-container.sh -g '/knowledge'` — reproduces 9/9 failures before the fix.
- `run-in-container.sh -g '/knowledge' --update-snapshots=changed` — 9 passed, 9 baselines written.
- `run-in-container.sh` (the full golden set, all 135 captures in the pinned image) — **135 passed, 0 failed** (2.6m), no other route moved.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` — `135 files, 12796.0 KiB of 32768.0 KiB`; every rewritten PNG got _smaller_ (largest 149.0 KiB, cap 320 KiB).
- All nine baselines `cmp`-equal to CI's own `-actual.png` from the run on the promoted commit.

## Flagged, not fixed

The golden `/knowledge` captures now read `updated now` on every card, because the fresh first-run
seed writes every note at the pinned instant. That is faithful to what the app renders under those
fixtures, but it means the golden set no longer distinguishes note ages, and a future regression in
`formatRelativeTime`'s date branch would not show up here. Giving the seeded notes staggered
`updatedAt` values would restore that coverage; it is a fixture change inside RC-KNW-2.2's surface
and outside a CI-recovery task's remit, so it is recorded rather than made.

## Outcome

The reported failure is fixed at its cause: the baselines now describe what the shipped code
renders. No test was deleted or skipped, no assertion loosened, no tolerance raised, and no workflow
protection changed — `maxDiffPixels` is still 40, the `visual-regression` job still compares with
`--update-snapshots=none`, and the size budget is unchanged.
