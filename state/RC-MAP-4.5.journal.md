# RC-MAP-4.5 run journal

## Scope

First-open map editor guidance: coach marks for rail → options → dock, shown once per vault; every
tool tooltip carries its key; `?` opens the shortcut overlay filtered to the map section. Owned:
`app/map/MapEditor.tsx`, `app/map/MapEditorChrome.tsx`, `app/map/ToolRail.tsx`,
`app/shortcuts/registry.ts`, `app/help/ShortcutsDialog.tsx`. Acceptance: e2e; the spotlight never
repeats. No agents, no dispatcher mutations, no push or promotion.

## Why this revision exists

Independent review confirmed the feature (ordered tour, seen-before-display record, storage-denial
suppression, tooltip legends, map-only help) and every gate, but held approval on one observed
failure it could not attribute:

```
[desktop-chromium] map-editor.spec.ts:342 › drawing a room adds a feature (undoable);
a placed POI nudges by arrow keys (WCAG 2.5.7)
  Error: expect(received).not.toBe(expected)   Expected: not 0.5
  Timeout 5000ms exceeded while waiting on the predicate        at map-editor.spec.ts:386:9
```

The candidate failed it in 1 of 3 focused runs; the exact base source passed 10 of 10. The reviewer
recorded the failure as real and its connection to the tour as unisolated.

## Isolation

The assertion is the arrow-key nudge of a POI that was placed one step earlier.
`EditorCanvas.handlePlace` selects the new POI inside the `.then()` of `editor.run(...)`, while
`window.__rt.state` publishes the POI before that callback runs — so the spec's
`expect.poll(poiCount)` can return while `editor.selection` is still empty. `keyboard.ts` nudges only
when `selection.length === 1`; with an empty selection ArrowRight takes the RC-MAP-4.2 "nearest POI
in that direction" branch, which excludes a POI that is not strictly ahead of the origin — the placed
POI sits on the origin's x — so the keypress moves nothing, and nothing re-presses it. The failure
snapshot of a local reproduction shows the POI popover mounting after the keypress (focus on the
editor root before the press, on the popover's "Players" visibility button after it), which is what a
late selection looks like from outside.

Experiment: a throwaway probe spec replayed the spec's exact sequence — draw a room, undo, place a
POI, `focus()` the shell, ArrowRight, poll the POI's x — in two variants on desktop-chromium at
`retries: 0`, 3 workers. The only difference between them is whether the tour is shown: the
suppressed variant pre-seeds `dndtools:react:seen-spotlights` with `map-editor` for the local vault,
which is exactly the base's behaviour for this test.

| Variant                          | Runs | Failures of the nudge assertion |
| -------------------------------- | ---- | ------------------------------- |
| Tour shown (this candidate)      | 70   | 0                               |
| Tour suppressed (base behaviour) | 70   | 2                               |

The failure reproduces with the tour off and did not reproduce with it on. It is pre-existing and
independent of RC-MAP-4.5; the reviewer's 10/10 base runs did not sample it.

Corroborating runs on this candidate, all green:

- `map-editor.spec.ts`, desktop + mobile chromium, `--repeat-each=3`: 252 passed, 12 skipped.
- Every test with "keyboard" in its title, both projects, `--repeat-each=5`: 60 passed.

## Not fixed here

The race lives in `app/map/canvas/EditorCanvas.tsx` (selection applied after the durable command
resolves), `app/map/keyboard.ts` and `tests/e2e/map-editor.spec.ts` — none of them owned by this
story, and two of them owned by the MAP-2 epic. It wants its own change: either wait for the app's
own "POI placed." announcement before the nudge, or have the placement select the POI as soon as the
command is accepted. Flagged for the operator rather than fixed inside this story.

## Change in this revision

The coach's decision, dismissal and highlight moved from passive effects to layout effects. The card
is now part of the first frame the editor paints and leaves in the same frame as the edit that ends
it; passive effects painted the editor once at full height and reflowed the canvas a frame later,
which moved the drawing surface under a pointer (or a measurement) already aimed at it. The
component's comment also records why the card sits in flow above the workspace instead of floating
over it: every anchor available in this editor covers a control the tour is telling the DM to use.

## Catching up with the rebased base

The branch now sits on a base that carries two gates the earlier revisions never met.

- **Emphasis lint (RC-ENG-8.4).** The tour's "Next"/"Done" was `<Button variant="primary">`, a second
  gold fill inside the editor dialog, so `multiple-accent-primaries` for `MapEditor.tsx` went 1 → 2
  and the Lint gate failed; the baseline may only shrink, so it is not the thing to move. The button
  is `variant="accent"` now — the same gold, as a tint rather than a fill, which the rule exempts and
  which leaves the header's "Project to players" as the region's one primary. Editor count is back at
  the baseline's 1.
- **Golden-route visual suite (RC-DSN-4.1).** `/atlas with the map editor open` is captured on a
  fresh vault, which is exactly when the tour shows, so all nine of its baselines (three themes ×
  three tiers) moved. Re-baselined in the pinned `playwright:v1.61.1-noble` image per
  docs/development/TESTING.md §8; the `-diff`/`-actual` pairs were read first and the only change is
  the card plus the accent outline on the highlighted rail. Nothing else in the suite moved: 135
  passed at `--update-snapshots=none`, budget 12796.5 of 32768.0 KiB.

## 2026-09-19 — expanded-ownership resumption

The operator's 2026-09-18 brief adds all nine map-editor PNGs to this task's claim. The
working tree started clean at `7cc64ba5`, with the implementation and those baselines already
committed. No further source or PNG changes were necessary. This revision only records fresh
verification in the required run journal; it does not alter dispatcher control state.

Retained baseline justification, individually identified by tier and filename below: each capture
opens a fresh vault and must show the first-open coach card and highlighted rail. The desktop,
rail and phone layouts each require their own capture, and each theme requires its own colors.

| Screenshot directory | Retained file                         | Reason                                             |
| -------------------- | ------------------------------------- | -------------------------------------------------- |
| `visual-desktop`     | `atlas-map-editor--high-contrast.png` | Desktop coach and rail outline in high contrast.   |
| `visual-desktop`     | `atlas-map-editor--parchment.png`     | Desktop coach and rail outline in parchment.       |
| `visual-desktop`     | `atlas-map-editor--tavern.png`        | Desktop coach and rail outline in tavern.          |
| `visual-phone`       | `atlas-map-editor--high-contrast.png` | Phone coach and rail outline in high contrast.     |
| `visual-phone`       | `atlas-map-editor--parchment.png`     | Phone coach and rail outline in parchment.         |
| `visual-phone`       | `atlas-map-editor--tavern.png`        | Phone coach and rail outline in tavern.            |
| `visual-rail`        | `atlas-map-editor--high-contrast.png` | Rail-tier coach and rail outline in high contrast. |
| `visual-rail`        | `atlas-map-editor--parchment.png`     | Rail-tier coach and rail outline in parchment.     |
| `visual-rail`        | `atlas-map-editor--tavern.png`        | Rail-tier coach and rail outline in tavern.        |

Fresh verification (exact command output inspected, all exited 0):

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/map-onboarding.spec.ts tests/e2e/shortcuts.spec.ts --workers=2 --retries=0`:
  **22 passed**, desktop and mobile. Includes completion, interruption, reload, another map in the
  same vault, separate vault history, skip, Escape, edit dismissal, storage denial, tool key
  legends and map-only `?` help.
- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- `pnpm lint:emphasis`: passed with baseline warnings (83 display-face findings and 61
  multiple-primary findings; allowed baselines 84 and 61).
- `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh -g '/atlas with the map editor open' --update-snapshots=none`:
  **9 passed** in the repository's pinned Playwright container; no snapshots rewritten.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 135 files, 12796.5 KiB of
  32768.0 KiB.
- `git diff --check`: passed before the journal update; checked again before committing it.

No new claim is made about the historical POI nudge race or the full application gate suite.
Central gates and independent review remain the operator's next step. No push or promotion.

## Visual gate recovery — phone coach hover

Read the original gate log for attempt `441ba04f-50fe-4860-b689-c227342e233f`
against `34033944`: 133 passed; phone tavern failed by 128 pixels and phone parchment
by 72 pixels. Inspected both original diff PNGs and the tavern expected/actual pair.
The highlighted differences are confined to Skip tour. The expected image contains
its hover background and primary text color; the actual contains its resting ghost
style. This explains why the earlier isolated nine-case run was insufficient evidence
for the later full-suite run.

`Button` handles mouse entry by mutating inline background/text colors. Touch devices
can synthesize mouse entry when Atlas is replaced by the editor. The coach now overrides
Skip tour's mouse-entry handler to apply the existing ghost hover colors only when
`(hover: hover)` matches. Its shared mouse-leave behavior and keyboard focus behavior
remain intact. This is scoped to `MapEditorChrome.tsx`; no shared DS or test files changed.

Re-rendered only the phone map-editor cases in the pinned container. Exactly two owned
baselines changed, each visually inspected afterward:

- `visual-phone/atlas-map-editor--tavern.png`: remove the accidental Skip tour hover fill
  and restore its resting secondary text color (108037 → 107801 bytes).
- `visual-phone/atlas-map-editor--parchment.png`: the same resting-state correction in
  parchment (110849 → 110653 bytes).

The other seven map-editor baselines were left byte-for-byte unchanged. No tolerance,
assertion, or retry policy was relaxed.

Verification completed so far:

- App typecheck passed.
- `pnpm gates` passed (existing file-size warnings).
- Onboarding and shortcuts e2e: 22 passed on desktop/mobile, two workers, zero retries.
- Prettier check on the edited source passed.

Final verification:

- `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none`:
  **135 passed (2.8m)**, exit 0. This is the full suite, including both previously failing phone
  captures. Original output retained locally at `/tmp/rc-map-4-5-visual.log`.
- Targeted ESLint for `MapEditorChrome.tsx` passed.
- `pnpm format:check:changed` passed for both changed text files.
- Baseline budget passed: 135 files, 12881.2 KiB of 32768.0 KiB.
- `git diff --check` passed.

The source fix, two necessary phone baseline updates, and this journal are the entire revision.
No push, promotion, additional agents, or dispatcher control edits.
