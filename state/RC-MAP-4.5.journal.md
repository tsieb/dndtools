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
