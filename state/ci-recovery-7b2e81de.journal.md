# ci-recovery-7b2e81de run journal

## Scope

Repair GitHub CI for promoted commit `7b2e81de8f4d29f615b9907ff763afe2d543d235`. Reported failing
workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or workflow
protections. No push, promotion, loops, additional agents, or dispatcher control-state edits.

This is the break the `ci-recovery-f38d7a47` journal explicitly flagged and did not absorb: "the
golden-route break arrived later on the integration branch, with the RC-KNW-2.2 note-card work. It
needs its own owner and its own re-baseline decision." That decision is made here.

## Diagnosis

### The only failing job

Run [35245713599](https://github.com/tsieb/dndtools/actions/runs/35245713599) (push of `7b2e81de`
to `loop/rc`) and run [35245720122](https://github.com/tsieb/dndtools/actions/runs/35245720122)
(the matching `Dispatcher delivery: loop/rc` PR run) both fail on exactly one job, `visual
regression (golden routes)`, at `Compare the golden routes with the committed baselines`. Every
other job is green in both runs: `build-and-test`, all three browser-E2E shards, accessibility,
Android, Electron smoke. The `Performance` and `Supply Chain` workflows on the same SHA are green.
`smoke-gate` is skipped, not failed — it gates on the visual job.

The `Unexpected any` lines that `gh run view` prints under ANNOTATIONS are ESLint **warnings** from
the green `build-and-test` job (`apps/gm-react/src/app/compendium/open5e.ts`,
`apps/gm-react/src/app/compendium/import.test.ts`). They pre-exist this commit and are not the
failure.

### Failure shape

Nine tests fail — `/knowledge` in all three themes on all three viewport projects:

| project          | tavern | parchment | high-contrast |
| ---------------- | ------ | --------- | ------------- |
| `visual-desktop` | fail   | fail      | fail          |
| `visual-rail`    | fail   | fail      | fail          |
| `visual-phone`   | fail   | fail      | fail          |

Nothing else in the 135-capture suite differs. CI reported 386 differing pixels for
`visual-desktop/knowledge--tavern.png`; the local container run reproduced the same nine failures
(210 differing pixels on `visual-phone/knowledge--high-contrast.png`, ratio 0.01 in every case),
which is above the suite's 40-pixel anti-aliasing tolerance.

### Root cause: a stale baseline, not a flake and not a regression

`456b27f4` (`feat(knowledge): RC-KNW-2.2 add note list information scent`) changed the note card's
modification stamp:

```diff
-{t('knowledge.updated', { when: formatStamp(n.updatedAt, formatDate) })}
+<time dateTime={n.updatedAt} title={...}>
+  {t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}
+</time>
```

The suite pins the clock to `2026-03-14T15:30:00Z` and seeds a fresh first-run vault, so every
seeded note's `updatedAt` **is** that instant. The old absolute stamp rendered `updated Mar 14`;
the relative one renders `updated now`. Cropping the expected and actual PNGs at the stamp confirms
that literal substitution and nothing else.

The RC-KNW-2.2 change is deterministic under the pinned clock, so this is stale, not flaky — it
fails identically on every run and on both profiles. `456b27f4` landed on `loop/rc` at
2026-09-16 12:55, about 90 minutes after the last re-baseline `e86f14db` (11:29, `/board`,
`/scene/:id` and `/settings`), which re-baselined a different set and left `/knowledge` behind.
`apps/gm-react/tests/visual/__screenshots__/*/knowledge--*.png` had not been touched since the
suite's own commit `dc930290`.

Per `docs/development/TESTING.md` §8, "a change that moves pixels on purpose re-baselines in the
same PR" — RC-KNW-2.2 did not, so the fix is to land that re-baseline now.

### What the diff does and does not contain

The pixel diff for all nine captures is confined to the `updated …` line on each of the six seeded
note cards. In particular, RC-KNW-2.2's other addition, `NoteListMetadata`, contributes **no**
pixels, and that is correct rather than a silent regression: it returns `null` when a note has
neither a `dndtools.folder` field nor body `#hashtags`, and none of the six seeded demo notes carry
either. Nothing about the card's layout, wrapping or chrome moved on any tier.

## Fix

Re-baselined the nine `/knowledge` PNGs inside the pinned Playwright image
(`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…`, the digest `ci.yml` and
`run-in-container.sh` pin, verified present locally by digest before the run):

```bash
apps/gm-react/tests/visual/run-in-container.sh -g "/knowledge" --update-snapshots=changed
```

`git status` lists exactly those nine files and no others. Each rewritten PNG was opened and read:
the Notes list renders its six cards with `updated now`, unchanged sidebar, header, toolbar and
card geometry, on all three tiers.

No spec, tolerance, budget, job condition or workflow protection was touched. The suite still
compares with `--update-snapshots=none` in CI, the 40-pixel tolerance is unchanged, and the
capture set is still 135.

## Validation

All in the pinned container on this host.

- `apps/gm-react/tests/visual/run-in-container.sh -g "/knowledge"` **before** the fix: 9 failed —
  the reported failure reproduced locally.
- `apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none` **after** the fix, which
  is the exact comparison the `visual-regression` job runs: **135 passed (2.4m)**, 0 failed.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs` (the job's first step): pass —
  `visual baselines: 135 files, 12796.0 KiB of 32768.0 KiB`. The file count is unchanged and the
  total moved by 3.5 KiB, so no capture grew to full-page or changed device scale factor.

This branch changes nine PNG baselines and adds this journal. It changes no source, spec, config or
workflow file, so no assertion was weakened and no unit or lint gate can be affected by it.

## Gotchas

- The same nine `/knowledge` baselines have been rewritten on several earlier `ci-recovery-*`
  branches that never reached `loop/rc`, so the break kept reappearing on each newly promoted SHA.
  Check whether a fix is already on the integration branch, not merely on a sibling task branch,
  before concluding it was never attempted.
- A golden-route failure whose diff is confined to a relative-time string is almost never flake.
  The clock is pinned, so `formatRelativeTime` is deterministic; a changing stamp means the render
  changed, which means a feature commit skipped its re-baseline.
- `--update-snapshots=changed` with `-g` rewrites only the matched captures, which keeps the
  reviewable diff to the nine files that actually moved instead of churning all 135 through
  history. The repo has no Git LFS, so every unnecessary rewrite is permanent weight.
