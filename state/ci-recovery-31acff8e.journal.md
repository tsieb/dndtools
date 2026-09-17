# ci-recovery-31acff8e run journal

## Scope

Repair GitHub CI for promoted commit `31acff8e71835972d4580ee6fbe51ce82ca98b8b`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or
workflow protections. No push, promotion, loops, additional agents, or dispatcher control-state
edits.

This is the break the sibling `ci-recovery-f38d7a47` deliberately did not absorb. Its journal
flagged `visual regression (golden routes)` as failing on `loop/rc` and left the re-baseline
decision to its own owner, which is this task.

## Diagnosis

### One job, nine failures, all on `/knowledge`

Both runs on `31acff8e` — [35243238611](https://github.com/tsieb/dndtools/actions/runs/35243238611)
and [35243233536](https://github.com/tsieb/dndtools/actions/runs/35243233536) — failed exactly
one job, `visual regression (golden routes)`. Every other job passed, including
`Android unit, lint, and package checks`, which is what `31acff8e` itself fixed.

The nine failures are one route in every theme on every layout tier:

| Project          | tavern | parchment | high-contrast |
| ---------------- | ------ | --------- | ------------- |
| `visual-desktop` | 386 px | 402 px    | 474 px        |
| `visual-rail`    | 366 px | 372 px    | 420 px        |
| `visual-phone`   | 183 px | 186 px    | 210 px        |

All nine are `/knowledge`. No other golden route diffs, so nothing global (fonts, tokens, the
shell) moved.

### The pixels that moved

Reproduced locally in the pinned image with
`apps/gm-react/tests/visual/run-in-container.sh -g '/knowledge'`. All nine failed with the
**same nine counts** CI reported, so the container reproduces the runner exactly and the diff is
deterministic rather than a rendering flake.

Comparing each committed baseline with the capture it rejected, the differing pixels sit in one
band per tier and nowhere else:

- `visual-desktop` 1280×800 — 1112–1120 raw pixels inside `(355,269)-(1038,435)`
- `visual-rail` 834×1112 — 1128–1134 inside `(155,273)-(553,596)`
- `visual-phone` 393×851 — 564–567 inside `(77,315)-(111,638)`

(Raw per-pixel counts; Playwright's own figures are lower because it applies a colour threshold
before counting.) Cropping the band on both images reads the difference directly: the baseline
says `updated Mar 14`, the current render says `updated now`. Card geometry, titles, excerpts,
the visibility chip and the note icon are pixel-identical — nothing reflowed.

### Cause: RC-KNW-2.2 changed the stamp and did not re-baseline

`456b27f4` (`feat(knowledge): RC-KNW-2.2 add note list information scent`) replaced the note
card's absolute stamp with a relative one:

```
-{t('knowledge.updated', { when: formatStamp(n.updatedAt, formatDate) })}
+{t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}
```

The `/knowledge` baselines date from `dc930290`, the suite's original commit, and no commit has
rewritten them since — `git log -- …/knowledge--tavern.png` returns `dc930290` alone. So they
still describe `formatStamp` output.

The CI history brackets it: the visual job was **green** on `e86f14db`
([35139443821](https://github.com/tsieb/dndtools/actions/runs/35139443821)) and **red** on
`14357344` ([35153411391](https://github.com/tsieb/dndtools/actions/runs/35153411391)).
`456b27f4` is the only commit promoted in that window that touches the render path, and it has
no CI run of its own because it was pushed together with `14357344`.

`14357344` (`fix(knowledge): keep secret callout tags off the player note card`) is in the same
window but moves nothing here: it changed where `NoteListMetadata` derives folder and tags
from, and on the first-run seed that component renders `null` either way — no seeded note
carries a `dndtools.folder` field or an in-body hashtag. The crops confirm it: there is no
folder or tag line above the excerpt in the baseline or in the new capture. That also explains
why a feature described as adding folder, tag and time scent moved only the time.

`31acff8e` did not cause this and could not have; it inherited a break that has failed every
`loop/rc` run since `14357344`.

## Fix

Re-baselined the nine `/knowledge` PNGs, which is what `docs/development/TESTING.md` §8
prescribes for a change that moves pixels on purpose:

```
apps/gm-react/tests/visual/run-in-container.sh -g '/knowledge' --update-snapshots=changed
```

Run inside `mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…`, the image the job
pins, because a baseline written on this Fedora host rasterises differently and would diff on
every Ubuntu run.

**No source, test, assertion or workflow file is touched.** The gate keeps its full strength:
the tolerance stays at 40 pixels per image, `--update-snapshots=none` still fails on a diff or
a missing baseline, and the `visual` path filter in `ci.yml` still lists
`apps/gm-react/tests/visual/**`, so this commit re-runs the job it repairs rather than skipping
past it.

### Why re-baseline rather than revert the stamp

The relative stamp is the reviewed intent of RC-KNW-2.2, and it is stable under the suite's
determinism contract rather than in spite of it. The clock is pinned with
`page.clock.setFixedTime`, the seeded notes take their `updatedAt` from that same frozen clock,
so the delta is always zero and the text is always `now` —
`apps/gm-react/src/i18n/index.test.ts:174` asserts `formatRelativeTime('en', now, now)` is
`'now'`. Four independent captures agree: CI's two runs, each of their retries, and the local
container run all produced identical diff counts. Reverting a shipped feature to satisfy a
stale baseline would be the weakening move, not the safe one.

## Validation

- **Reproduction** — `run-in-container.sh -g '/knowledge'` on the unmodified tree: 9 failed,
  with the same per-image diff counts CI reported.
- **Re-baseline** — same command with `--update-snapshots=changed`: `9 passed (16.1s)`, nine
  files rewritten, none other touched.
- **Byte check** — each rewritten PNG differs from the one it replaces only inside the band
  measured above, and matches the capture CI rejected; the diff is the one change, not the one
  change plus host noise.
- **Full suite** — `run-in-container.sh --update-snapshots=none`, the exact mode the CI job
  runs: all 135 golden-route comparisons pass. No other route had drifted underneath this one.
- **Size budget** — `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: pass,
  135 files, 12796.0 KiB of 32768.0 KiB. Every rewritten PNG is a few hundred bytes _smaller_
  than its predecessor (`now` is shorter than `Mar 14`), so the budget headroom grows.

## Notes

No regression guard is added, and that is deliberate. The check that should have caught this
did catch it — `visual-regression` failed, loudly, on the first run after `456b27f4` and on
every run since. What failed was the response, not the gate: the break sat behind a red Android
setup step for a day, so the job list was already red for an unrelated reason. Adding a second
mechanism would not have shortened that.

Worth flagging for whoever next runs `grep` over the app: `apps/gm-react/src/i18n/format.ts`
contains a literal `NUL` byte in a cache-key template (`` `${locale}\0${…}` `` written as the
raw character, offset ~1240). It compiles and ships fine, but `file` reports the source as
`data` and GNU `grep` silently treats it as binary and prints nothing. That cost time here and
will cost it again.
