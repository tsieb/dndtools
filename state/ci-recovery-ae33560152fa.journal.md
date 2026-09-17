# ci-recovery-ae33560152fa run journal

## Scope

Repair GitHub CI for promoted commit `ae33560152fa6d5b448220107462e78d286faffa`
(`docs(ci): record the d4729e8f CI recovery and its reconciliation`). Reported failing workflow:
`CI`. Reproduce locally, fix the cause, verify the integration candidate without weakening tests
or workflow protections. No push, promotion, loops, additional agents, or dispatcher control-state
edits.

This branch sits on the `loop/rc` tip, `830b7382`, which already contains the promoted commit.

## Diagnosis

CI ran twice on this SHA and both runs failed the **same single job**:

- [35253510469](https://github.com/tsieb/dndtools/actions/runs/35253510469) (`push`)
- [35253514459](https://github.com/tsieb/dndtools/actions/runs/35253514459) (`pull_request`, PR #76)

In both, `visual regression (golden routes)` is the only failure. Everything else on the SHA
passed — `detect runtime changes`, `build-and-test`, all three `browser E2E` shards,
`Electron smoke (Linux)`, `accessibility (desktop + mobile)`, `Android unit, lint, and package
checks` — and the `Performance` (35253514190) and `Supply Chain` (35253514404) workflows on the
same SHA both succeeded.

The job died in `Compare the golden routes with the committed baselines` with nine
`toHaveScreenshot` failures, and all nine are the same route:

| Project          | Themes that failed               |
| ---------------- | -------------------------------- |
| `visual-desktop` | tavern, parchment, high-contrast |
| `visual-rail`    | tavern, parchment, high-contrast |
| `visual-phone`   | tavern, parchment, high-contrast |

Every one is `golden-routes.spec.ts:108:4 › /knowledge`. No other route, and no other job, is
affected.

Unpacking the run's `visual-regression-report` artifact (10512276947) and cropping the
`expected` against the `actual` shows a single difference, repeated once per note card:

```
expected:  updated Mar 14
actual:    updated now
```

Nothing else moves. The per-file bounding box of the change is the metadata line band only —
`684x167+355+269` on desktop, `399x324+155+273` on rail, `35x324+77+315` on phone.

Root cause: the baselines are stale, and provably so from history rather than by inference. The
`/knowledge` PNGs were captured once, by `dc930290` (`test(visual): RC-DSN-4.1 golden-route visual
regression suite`). Three commits then landed on that screen, and one of them changed the very
text that now differs — `456b27f4` (`feat(knowledge): RC-KNW-2.2 add note list information
scent`), whose stated intent is "localized relative modification times":

```diff
-{t('knowledge.updated', { when: formatStamp(n.updatedAt, formatDate) })}
+<time dateTime={n.updatedAt} title={formatDate(new Date(n.updatedAt), { … })}>
+  {t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}
+</time>
```

`git merge-base --is-ancestor dc930290 456b27f4` succeeds, so the baselines predate the change.
RC-KNW-2.2 touched three files — `NoteListMetadata.tsx`, `index.tsx` and its own journal — and no
PNG, which is exactly the same-PR re-baseline that `docs/development/TESTING.md` §8 requires ("A
change that moves pixels on purpose re-baselines in the same PR"). The screen has rendered
`updated now` ever since; the committed baselines still describe the pre-RC-KNW-2.2 screen.

`now` is the correct rendering here, not a bug to fix in the screen. The suite pins the clock to
`FIXED_TIME = 2026-03-14T15:30:00Z` and captures the fresh first-run vault, whose seeded notes are
written at that instant, so `formatRelativeTime(updatedAt)` against a `Date.now()` frozen to the
same instant is `now` by construction. The old `updated Mar 14` was `formatDate` rendering that
same timestamp absolutely.

This is deterministic, not a flake. The failure is present on every run and every retry, and the
per-image pixel counts are identical between the runner and this host (see below).

## Local reproduction

Run in the pinned image — the only environment the committed baselines describe — via
`apps/gm-react/tests/visual/run-in-container.sh`, which pins
`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`,
the same digest `ci.yml:272` pins. That digest is present locally, so the comparison is against
the identical browser build.

```
apps/gm-react/tests/visual/run-in-container.sh -g knowledge
→ 9 failed, the same nine tests the runner reported
```

The per-image pixel counts match the runner exactly, in both sets and one-to-one:

| Baseline                                  | Runner | This host |
| ----------------------------------------- | ------ | --------- |
| `visual-desktop/knowledge--high-contrast` | 474    | 474       |
| `visual-desktop/knowledge--parchment`     | 402    | 402       |
| `visual-desktop/knowledge--tavern`        | 386    | 386       |
| `visual-rail/knowledge--high-contrast`    | 420    | 420       |
| `visual-rail/knowledge--parchment`        | 372    | 372       |
| `visual-rail/knowledge--tavern`           | 366    | 366       |
| `visual-phone/knowledge--high-contrast`   | 210    | 210       |
| `visual-phone/knowledge--parchment`       | 186    | 186       |
| `visual-phone/knowledge--tavern`          | 183    | 183       |

Identical counts on a different host are what rules out a rendering or host difference: the
container is reproducing the runner's pixels, so what the baselines disagree with is the
application, not the environment.

## The repair

Re-baseline the nine `/knowledge` PNGs, in the pinned image, with the documented command:

```
apps/gm-react/tests/visual/run-in-container.sh -g knowledge --update-snapshots=changed
→ 9 passed, 9 baselines re-generated
```

Exactly nine files change. No source, test, workflow, config or tolerance is touched.

## Verification

**The new baselines are byte-identical to what the runner rendered on this SHA.** This is the
strongest check available without pushing, and it is the one that matters: the artifact's
`-actual.png` is the runner's own output for the failing comparison, so a byte match means the
runner's next comparison is against its own pixels. `cmp` on all nine:

```
IDENTICAL  tavern/visual-desktop          IDENTICAL  parchment/visual-desktop
IDENTICAL  tavern/visual-rail             IDENTICAL  parchment/visual-rail
IDENTICAL  tavern/visual-phone            IDENTICAL  parchment/visual-phone
IDENTICAL  high-contrast/visual-desktop   IDENTICAL  high-contrast/visual-rail
IDENTICAL  high-contrast/visual-phone
```

**The full suite passes the way CI runs it.** `--update-snapshots=none` is the flag the
`visual-regression` job uses, so a missing or differing baseline fails rather than being rewritten:

```
apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none
→ 135 passed (2.4m)
```

All 135 captures, every route × theme × tier — not just the nine that were rewritten — so no other
surface was disturbed and no baseline was orphaned.

**The size budget the job enforces first still passes.**

```
node apps/gm-react/tests/visual/check-baseline-budget.mjs
→ visual baselines: 135 files, 12796.0 KiB of 32768.0 KiB
```

Each rewritten PNG is slightly smaller than the one it replaces, `now` being shorter than
`Mar 14`, so the budget moves in the safe direction.

**Each rewritten PNG was opened and reviewed**, as §8 requires, and the diff against its
predecessor was bounded per file. The bounding boxes above cover only the `updated …` metadata
line; card layout, chips, icons, excerpts, chrome and theme colours are unchanged. The desktop,
rail and phone captures were also read at full size to confirm the screen is intact rather than
merely different in the expected place.

## Nothing was weakened

The branch changes ten files: nine PNGs and this journal. `git status` confirms no other path is
modified. No assertion, test, spec, workflow, gate or tolerance is touched — in particular the
suite's `maxDiffPixels` allowance, `--update-snapshots=none` in `ci.yml`, and the baseline size
budget are all exactly as they were. The job stays as strict as it was; it now compares against a
baseline that describes the screen the application actually renders.

## Note for the integration branch

Per the RC-DSN-4.1 contract, a baseline is only valid from the pinned image, and these were
produced there and cross-checked against the runner's own output byte for byte. Earlier recovery
branches carried the same re-baseline without reaching `loop/rc`, which is why the job has stayed
red across several promoted SHAs. This branch is based directly on the `loop/rc` tip `830b7382`,
so it applies cleanly and the nine PNGs are the whole of the change.
