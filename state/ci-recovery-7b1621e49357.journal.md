# ci-recovery-7b1621e49357 — run journal

Task: repair GitHub CI for promoted commit `7b1621e49357e23163555b66638984c6a0b20a92`
(`docs(ci): record the e86f14db4962 CI recovery and its reconciliation`).
Failing workflow: CI.

## Diagnosis

The promoted SHA is `origin/loop/rc`'s tip. Querying the job list rather than the summary
page shows exactly one red job across both runs on the SHA — `35274490182` (push) and
`35274494699` (`pull_request`):

```
failure   visual regression (golden routes)
success   build-and-test, browser E2E (1..3 of 3), Electron smoke (Linux),
          accessibility (desktop + mobile), Android unit/lint/package checks
```

The sibling `Performance` (`35274494628`) and `Supply Chain` (`35274494696`) workflows are
green on the same SHA. So the Android `tools`-package recovery has held, and golden routes
is `loop/rc`'s only remaining red.

The job reports `9 failed, 126 passed`, and the nine are the same route in every
combination — `/knowledge` across three projects (`visual-desktop`, `visual-rail`,
`visual-phone`) in three themes (`tavern`, `parchment`, `high-contrast`). No other route
moved a pixel. Thresholded diffs: 386/402/474 desktop, 366/372/420 rail, 183/186/210 phone,
against `maxDiffPixels: 40` (`apps/gm-react/playwright.config.ts:127`).

The named commit is documentation only and cannot move a pixel. The regression entered at
`456b27f4` (RC-KNW-2.2, "add note list information scent"), which changed
`apps/gm-react/src/screens/knowledge/index.tsx:409` from an absolute
`formatStamp(n.updatedAt, formatDate)` to `formatRelativeTime(new Date(n.updatedAt))` and
did not re-baseline this route. The re-baseline immediately before the knowledge work
(`e86f14db`) covered `/board`, `/scene/:id` and `/settings`; `/knowledge` moved afterwards
and was missed.

## The rendered difference is one text run, and it is deterministic

Cropping the old baseline against the new on `visual-desktop/knowledge--tavern` reads the
change directly: `updated Mar 14` → `updated now`. Card borders, titles, excerpts, icons
and chips are pixel-identical.

Per-image raw byte-diff bounding boxes, computed old-vs-new with `pngjs`:

```
visual-desktop  tavern/parchment/high-contrast   684x167+355+269   (canvas 1280x800)
visual-rail     tavern/parchment/high-contrast   399x324+155+273   (canvas  834x1112)
visual-phone    tavern/parchment/high-contrast    35x324+77+315    (canvas  393x851)
```

The phone box is 35px wide — the width of the trailing word. The desktop and rail boxes are
wider only because several note cards sit side by side, so the box is the union of several
one-word runs. Nothing outside the updated-line changed. (A raw byte diff counts ~3× more
pixels than Playwright, which applies an anti-aliasing threshold, so these counts are
expected to exceed the job's.)

`now` is the deterministic render, not a flake. `golden-routes.spec.ts:18` pins
`FIXED_TIME = 2026-03-14T15:30:00Z`, and `stage()` applies it via `page.clock.setFixedTime`
before the first document loads. The seeded notes' `updatedAt` is written under that same
frozen clock, so the delta is exactly 0 and falls below the one-second bucket
(`i18n/index.test.ts:174` asserts `formatRelativeTime('en', now, now) === 'now'`). The old
absolute form printed `Mar 14` from the same instant, which is why both values name the
pinned time. Both are stable — this is a stale baseline, not a clock-dependent flake, so
re-baselining is the correct repair and weakens nothing.

`NoteListMetadata`, RC-KNW-2.2's other half, renders nothing for the seeded notes (they
carry neither folder nor tags), so it contributes no pixels.

## Repair

Cherry-picked `283580fc` (recorded in the commit trailer), whose parent is this task's base
`7b1621e4` exactly, so it applied with no conflict. Its entire delta is the nine PNGs — no
spec, config, tolerance or workflow change:

```
$ git diff --stat 7b1621e4 HEAD
 .../visual-{desktop,rail,phone}/knowledge--{tavern,parchment,high-contrast}.png | Bin
 9 files changed, 0 insertions(+), 0 deletions(-)
```

## Verification

**Byte-proof against the runner's own pixels — 18/18 identical, no exception.** Downloaded
the failing run's `visual-regression-report` artifact (`10519732569`, from run
`35274490182`) and compared each new baseline against CI's
`test-results/.../knowledge--<theme>-actual.png` for both the first attempt and the
`-retry1` directory:

```
identical=18  mismatched=0  of 18
```

Every one byte-identical. That means CI's next comparison on this route is against its own
rendered pixels — an observed green, not a prediction. The documented 22-px app-bar
placeholder wobble did not appear in this run.

This also demonstrates cross-run determinism: the same bytes proved out against run
`35153405543` previously and against `35274490182` here, two independent runs.

**Full suite in the pinned image.** `apps/gm-react/tests/visual/run-in-container.sh`
(digest `sha256:5b8f294a…`, matching `ci.yml:272`), invoked as CI does with
`--update-snapshots=none`:

```
135 passed (2.7m)     EXIT=0
```

The working tree is clean afterwards, confirming the compare run rewrote no baseline.

**Size budget**, which CI enforces as its own step:

```
$ node apps/gm-react/tests/visual/check-baseline-budget.mjs
visual baselines: 135 files, 12796.0 KiB of 32768.0 KiB     exit=0
```

**The job still runs rather than skipping into a false green.**
`apps/gm-react/tests/visual/**` is inside the `visual` paths-filter (`ci.yml:52-62`), which
gates the `if` at `ci.yml:268`; and the tier step (`ci.yml:70-76`) only yields `smoke` for a
PR based on `initiative/*`, so a push or a PR into `loop/rc`/`main` is `full`. A
baseline-only commit therefore sets `visual=true` at `tier=full` and is genuinely compared.

## Note for the operator

This is the sixteenth re-baseline of these same nine PNGs. The diagnosis has been settled
for some time; the blocker is integration, not difficulty — the recovery task has no push
or promote authority. Fifteen prior attempts never reached `loop/rc`, and the only commit
touching these files that ever did is `dc930290`, which created the baselines. This branch's
base _is_ the current `origin/loop/rc` tip, so it fast-forwards.

Nothing outside the nine baselines and this journal changed.

## Gate feedback: Format (changed)

The first attempt (`3cf12ec4`) passed Quality gates but failed `Format (changed)` on this
journal alone — Prettier normalises `*is*` to `_is_` for emphasis. Reformatted with
`pnpm exec prettier --write`; the one-character change is the whole diff, and no baseline,
assertion or protection moved.

⚠️ Re-run the check the way the gate does, with the base it uses:

```
$ pnpm run format:check:changed -- --base loop/rc
checking formatting for 1 changed file(s)
All matched files use Prettier code style!     exit=0
```

Invoked bare, `format:check:changed` resolves a different base, reports
`no supported files changed` and exits 0 without inspecting anything — a green that proves
nothing. Always pass `--base loop/rc`.
