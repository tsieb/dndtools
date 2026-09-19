# ci-recovery-830b7382f9de run journal

## Scope

Repair GitHub CI for promoted commit `830b7382f9de81c7bcf1aff840f8eae95a2ca616`
(`docs(ci): record the a98941338404 CI recovery and its reconciliation`). Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify the integration candidate without
weakening tests or workflow protections. No push, promotion, loops, additional agents, or
dispatcher control-state edits.

## Diagnosis

CI ran twice on this SHA and both runs failed the **same single job**:

- [35255380366](https://github.com/tsieb/dndtools/actions/runs/35255380366) (`push`), job
  `105317677400`
- [35255388441](https://github.com/tsieb/dndtools/actions/runs/35255388441) (`pull_request`), job
  `105317682218`

In both, `visual regression (golden routes)` is the only failure, and inside it the failures are
exactly the nine `/knowledge` captures — 3 viewport projects × 3 themes — with `126 passed`. The
other workflows on the SHA were green: `Performance` (35255388466) and `Supply Chain`
(35255388697). So the break is one route wide, not a suite-wide or environment break.

The promoted commit cannot be the cause: `830b7382` adds a single markdown file
(`state/ci-recovery-a98941338404.journal.md`) and moves no pixels. This is inherited red.

Per-image diff counts reported by the runner:

| project          | tavern | parchment | high-contrast |
| ---------------- | -----: | --------: | ------------: |
| `visual-desktop` |    386 |       402 |           474 |
| `visual-rail`    |    366 |       372 |           420 |
| `visual-phone`   |    183 |       186 |           210 |

### The diff is one text run per note card

Rather than infer this, the runner's own pixels were read. The failed run's
`visual-regression-report` artifact (`10513215245`) was downloaded and each
`knowledge--<theme>-actual.png` diffed against the committed baseline. Every diff is confined to
one bounding box per image, in the note cards' metadata line:

| project          | bounding box      |
| ---------------- | ----------------- |
| `visual-desktop` | `684x167+355+269` |
| `visual-rail`    | `399x324+155+273` |
| `visual-phone`   | `35x324+77+315`   |

Cropping and magnifying that box in expected-vs-actual reads the change directly: the baseline
prints `updated Mar 14`, the render prints `updated now`. Card titles, bodies, borders, badges and
the eye affordance land on identical pixels — the phone box is only 35 px wide, which is the width
of the changed word alone.

Cause: `456b27f4` (RC-KNW-2.2) changed `apps/gm-react/src/screens/knowledge/index.tsx` from an
absolute stamp to a relative one — `index.tsx:409` now renders
`t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })`. The suite pins the
clock to `FIXED_TIME = 2026-03-14T15:30:00Z` (`golden-routes.spec.ts:18`), and the seeded notes
carry that same instant: `stage()`'s own comment records that "with the clock fixed, every seeded
note shares one `updatedAt`". A zero relative delta formats as `now`, which
`apps/gm-react/src/i18n/index.test.ts:174` asserts directly
(`expect(formatRelativeTime('en', now, now)).toBe('now')`).

**Both forms are deterministic.** The old baseline was correct for the absolute formatter and the
new render is correct for the relative one; nothing here depends on wall-clock time, so this is a
stale baseline rather than a clock-dependent flake. Re-baselining is therefore the correct repair,
and it is the _only_ repair available that does not revert shipped product behaviour: the
alternatives would be reverting RC-KNW-2.2's formatter or loosening the comparison, both of which
are out of scope and the latter of which would weaken the gate.

The earlier re-baseline `e86f14db` covered `/board`, `/scene/:id` and `/settings`; `/knowledge`
moved after it and was missed.

## Reproduction

`apps/gm-react/tests/visual/run-in-container.sh` runs the suite in the same pinned image the CI job
uses (`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…`, identical digest in
`ci.yml` and the script).

`run-in-container.sh --update-snapshots=none -g '/knowledge'` reproduced the failure: **9 failed**,
and the reported counts matched the runner's table above exactly, down to `210` for
phone/high-contrast.

Stronger than matching counts: all nine locally rendered `-actual.png` files are **byte-identical**
(`cmp`) to the runner's own `-actual.png` for the same image. The local container is not merely
similar to CI here, it is pixel-for-pixel the same renderer.

## Repair

`run-in-container.sh --update-snapshots=changed -g '/knowledge'` rewrote exactly nine files and
nothing else:

```
apps/gm-react/tests/visual/__screenshots__/visual-{desktop,rail,phone}/knowledge--{tavern,parchment,high-contrast}.png
```

Diffing each rewritten baseline against its predecessor in `HEAD` reproduces the same bounding
boxes listed under Diagnosis, so the only pixels that moved are the timestamp text run.

## The new baselines are CI's own pixels

This is verification, not prediction. Each of the nine new baselines was `cmp`-ed against the failed
run's `-actual.png` for both the first attempt and `retry1` — 18 comparisons, **all byte-identical,
zero differing**. CI's next comparison on this branch is against the bytes its own runner produced,
so the job cannot diff.

A third independent source agrees: these nine bytes are also byte-identical to those in `a7563604`,
a sibling attempt generated separately on the same base. Three independent generations converging
on the same bytes is what a deterministic capture looks like.

The job will genuinely re-run rather than skip into a false green: the `visual` paths-filter in
`ci.yml:52-62` lists `apps/gm-react/tests/visual/**`, which is exactly what this branch edits, so
`needs.changes.outputs.visual` is `true` and the `if` at `ci.yml:268` admits the job. The fix is
confirmed by the gate, not by the gate declining to look.

## Validation

- `run-in-container.sh --update-snapshots=none` — the **full** suite, not just the repaired route:
  **135 passed (2.4m)**, zero failures. This is the exact command and flag the CI step runs.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` — exit 0,
  `135 files, 12796.0 KiB of 32768.0 KiB`. CI enforces this as its own step, before the comparison.
- `pnpm ci:local` — **exit 0, all eight steps PASS**: `gates`, `security:secrets`,
  `format:check:changed`, `lint`, `typecheck`, `build`, `test`, `test:coverage:core`. This mirrors
  the CI `build-and-test` job. Unit totals, all passing: core 276 files / 4,830 tests; cloud 38 /
  499; app 134 / 1,481; tooling 26 / 192.
- `prettier --check` on this journal — clean, so `format:check:changed` stays green on the one text
  file this branch adds.
- The 18 `cmp` results above.

Nothing was weakened. This branch changes nine PNG baselines and adds this journal. No workflow, no
spec, no assertion, no threshold and no source file is touched: `golden-routes.spec.ts` still runs
at `--update-snapshots=none`, still captures every theme on every tier, and still fails on any
pixel diff or missing baseline. The gate's strictness is unchanged; only the expected bytes for one
route are corrected.

## Out of scope, flagged not absorbed

**This repair has been attempted twelve times before and has never reached the integration
branch.** Twelve prior commits rewrite these same nine PNGs — `bf0d9667`, `49dbebff`, `eb3c1d4b`,
`6dda32b5`, `097abb1d`, `f903a839`, `8dff2e65`, `baff5510`, `14febe02`, `4d9532e3`, `38a18b0b`,
`a7563604` — each on its own `dispatch/dndtools/*` branch, and
`git merge-base --is-ancestor <sha> origin/loop/rc` fails for **every one of them**. The only
commit touching these files that _is_ on `loop/rc` is `dc930290`, which created the baselines.

So the blocker is not diagnosis or repair — both are settled, and this candidate is byte-verified
against CI. The blocker is integration. This branch is based directly on the current `origin/loop/rc`
tip `830b7382` (verified equal at the time of writing, with an empty diff to the merge base), so it
applies as a fast-forward and needs no conflict resolution. Whatever is dropping these candidates
sits downstream of this task's authority: pushing and promoting are explicitly out of scope here,
so it is recorded rather than worked around.
