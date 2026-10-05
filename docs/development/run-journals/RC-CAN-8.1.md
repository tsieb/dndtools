# RC-CAN-8.1 — The canvas draws exactly what the history says

Run journal for the implement pass on `dispatch/dndtools/339614ec280bfd7e2416`, based on `6dcb0a00`.

## Causes found

- **CAN-1 (drag, Undo, frame stays put).** `SceneBoardCanvas` dropped a pointer draft only once it
  equalled the committed layout. `/board`'s `move` clamps a drop to its columns, so a clamped drop
  never matched: the draft outlived the commit and kept painting the frame at the drop point after
  Undo rewound the core and the layout-issues banner.
- **CAN-7 (Ctrl+Z after a keyboard move flips only the toolbar).** `SceneRuntime` queues commands
  and re-renders after each persist, so a second arrow press inside that window read the old layout
  and committed the same target again. Three presses made three undo steps, two of them no-ops, and
  Ctrl+Z reversed one of those.
- **CAN-8 (palette add).** "Add tile" dispatched `scene.add-widget` straight to the runtime (never on
  the stack, and the core cannot invert an add from the state before it), at the definition's
  220×160 default.

## Change

- `useLayoutHistory`: an undo step is now a list of commands. `beginBurst`/`settle` fold every `run`
  in between into one step (move/resize keep the newest forward and the oldest inverse per tile).
  `inverseCommands` inverts placing commands (`scene.add-widget`, `scene.apply-template`,
  `scene.duplicate-widget` without `copyId`) by diffing the state after: one `scene.destroy-widget`
  per new tile, plus a `scene.update-metadata` restoring the background when a template replaced it
  on an empty scene. Redo of a destroy is the tombstone restore, so redo brings back the same
  instances. Undo and redo close any open burst.
- The hook also subscribes to `SceneRuntime.onDispatched` (the runtime's accepted-local-dispatch
  signal) and records this device's own `scene.add-widget` and `scene.apply-template` operations on
  its scene as undo steps. That is how a palette "Add tile" and a template-picker apply become
  undoable without either caller knowing about the stack; a placement that also came through `run`
  is not recorded twice. A co-DM's or the assistant's placements are not recorded.
- `SceneBoardCanvas`: pointer drafts clear when their commit settles and on any undo/redo. Arrow
  and Shift+Arrow nudges (and the resize handle's arrows) open a burst; Escape on the frame, focus
  leaving the frame, the handle's Escape, a new pointer gesture, undo and redo close it. Pending
  nudge targets (never painted) let fast presses build on each other. Pointer group drags and
  arrange actions are one step each.
- `WidgetFrame`: `frameName` builds the accessible name from the received layout; new `onSettle`.
- `board-helpers`: `BOARD_TILE_SIZE`, `defaultTileSize` (the one default-size table: 240px column
  spans and at least 160 high on the board and flow, the definition default on the free canvas) and
  `addTileCommand`.
- `Board`: gallery adds use the table's size, re-find the first open slot at that size on the
  bounded board, and go through `history.run`.
- `paletteRows.ts` needed no change: it builds the screen navigation rows, not Add tile.

## Claim (second pass)

The first pass also edited `AddWidgetGallery.tsx`, `TemplatePicker.tsx`, `paletteActions.ts`,
`registry.ts`, `sceneEditor/index.tsx`, `useSceneCommands.ts` and the en/es/qps-ploc catalogs. The
gate rejected the paths outside the claim, and all of them are reverted to `6dcb0a00`. The
dispatch-signal recorder above replaces the palette and template hand-off; `Board` re-finds the
gallery slot itself.

What this leaves undone, because only unowned files can do it (none of it is in the acceptance
criteria):

- ~~A palette "Add tile" is undoable but still lands at the definition's own size (220×160 for most
  tiles).~~ Fixed in the fourth pass (below): independent review held that the story text requires
  it regardless of the claim.
- `/scene/:id` gallery adds are undoable through the same signal but keep the definition size, as
  before (`useSceneCommands.ts` builds them).

## Evidence

- New unit tests: `SceneBoardCanvas.test.tsx` (clamped drop then Undo/Redo: frame position equals
  the state layout; three nudges + Escape + Ctrl+Z restore), `shortcuts/paletteActions.test.tsx`
  (the real palette row adds a tile through a runtime-shaped dispatcher; Undo removes it, Redo
  restores the same id), six new `useLayoutHistory` cases (bursts, an undo inside a burst, an add
  through `run` recorded once, a template applied past the stack, the template background), and
  `frameName` printing "size 240 by 160" in `WidgetFrame.test.tsx`. All three `SceneBoardCanvas`
  tests fail against the old canvas; the palette test fails with the dispatch subscription disabled.
- New e2e `canvas-history.spec.ts`, both profiles: drag past the edge, Undo, the canvas screenshot
  matches the pre-drag capture (per-channel tolerance 8 for Chromium's ±1 anti-aliasing at rounded
  corners; Undo/Redo cluster masked); keyboard move, Escape, Ctrl+Z restores; axe clean. Both tests
  fail on desktop against the old canvas.
- The edit-mode axe scan excludes `[data-widget-region]`: on the phone the Prep tile's body overflows
  and `WidgetRenderSlot` gives its scroll region `tabindex=-1` in edit mode, which axe reports as
  `scrollable-region-focusable` with or without this change. The full board, bodies included, is
  scanned clean in view mode afterwards. That finding belongs to the body (and to CAN-8.2's resize).
- Second pass: `vitest --config vitest.app.config.ts` 162 files, 1763 tests passed; `tsc --noEmit`,
  `eslint` and `prettier --check` on every path changed from `6dcb0a00` pass.

## Third pass: file-size gate

`pnpm gates` failed on `63702075`: `SceneBoardCanvas.tsx` was 879 lines and `WidgetFrame.tsx` 815,
over the 800-line hard limit (RC-STB-2.7). Code moved between owned files, no behaviour change:

- `canvas/keyboard.ts` now holds `canvasKey` (the zoom/undo/redo key classifier), `useNudges` (the
  pending keyboard targets) and `useDragOverlay` (the pointer drafts, cleared on any undo/redo,
  returned as one stable `overlay` handle).
- `board-helpers.ts` now holds `dockedPosition` and `frameName`.
- `useLayoutHistory` gained `oneStep(work)`, which replaces the canvas's local `asOneStep`.

After: `SceneBoardCanvas.tsx` 788 lines, `WidgetFrame.tsx` 800. `pnpm gates` passes; `tsc --noEmit`,
`eslint` (no warnings) and `prettier --check` on every changed path pass;
`vitest --config vitest.app.config.ts` 162 files, 1763 tests passed.

- Playwright on `bd6862fb`, desktop-chromium and mobile-chromium: `canvas`, `canvas-keyboard`,
  `canvas-arrange`, `command-palette`, `flow-layout`, `scene-surfaces` and `canvas-history`, 150
  passed (3.2 min).

## Fourth pass: independent review findings on `7720111d`

Two findings, both reproduced with the reviewer's own regression tests
(`history-review.test.tsx`, `palette-review.test.tsx`) before changing anything: 2 failed / 12 passed.

- **Burst grouping lost when Escape/blur lands during pending persistence (high).** `settle()`
  cleared the burst, but `run` only decided which burst owned a command after `dispatch` resolved, so
  nudges still queued behind the vault persist became steps of their own. Now:
  - `run` captures the burst open at the moment it is CALLED and folds into that burst's step
    whenever it completes. `settle` only stops later calls joining.
  - `run`, undo and redo share one serial queue inside the hook (an idle queue starts the job at
    once, so the core still holds the edit the instant `run` is called). Each run reads its
    before-state when its own dispatch is about to land, not while an earlier nudge is still queued,
    and undo waits for every run in flight rather than only the latest.
  - `SceneBoardCanvas.moveAll` issues every selected tile's `onMove` at once. Before this, a group
    nudge's second tile joined whatever burst was open once the first tile had persisted.
- **Palette Add tile still landed at 220×160 (medium).** I crossed the claim minimally into
  `app/shortcuts/paletteActions.ts`, because the requirement is in the story text and the owned files
  can't satisfy it. `placeTile` now sizes from `defaultTileSize` (the definition's declared and
  minimum sizes, with the mounted canvas's policy, or off the canvas the policy the scene's own
  canvas would use), then finds the slot at that size. Dice on `/board` lands at 240×160.

The edit-mode axe scan in `canvas-history.spec.ts` no longer excludes tile bodies. It scans the
whole board and lets through only `scrollable-region-focusable` whose every node is a
`[data-widget-region]` element. That's the known body finding from `WidgetRenderSlot`, which is out
of claim. The view-mode scan still has no exceptions. The keyboard e2e now presses Escape right after
the three nudges, without waiting for them to commit.

New tests, each confirmed to fail against `7720111d`'s code and pass now:

- `useLayoutHistory.test.tsx`: a nudge still persisting when Escape settles the burst folds into it;
  an undo right after Escape waits for every nudge still persisting.
- `SceneBoardCanvas.test.tsx` (its runtime stand-in now queues dispatches behind a persist the way
  `SceneRuntime` does): two selected tiles, two ArrowDowns and Escape while persistence is held, then
  one Ctrl+Z restores both tiles and their painted frames.
- `paletteActions.test.tsx`: palette Add tile: Dice lands at 240×160.

Evidence on the working tree before commit:

- Reviewer's regression config: 14/14 passed.
- `vitest --config vitest.app.config.ts`: 162 files, 1767 tests passed.
- `pnpm gates`: exit 0.
- `tsc --noEmit` (gm-react), `eslint` on changed files, `format:check:changed --base 6dcb0a00`: clean.
- Playwright, desktop-chromium and mobile-chromium: `canvas-history`, `canvas-keyboard`, `canvas`
  and `command-palette` (130 passed); `canvas-arrange`, `flow-layout`, `scene-surfaces`,
  `custom-widgets` and `screen` (59 passed); `starter-widgets` and `custom-widgets` on desktop
  (11 passed). The parallel run printed some `[WebServer] … ErrorBoundary` stack lines that I could
  not reproduce in serial reruns on either profile (19 and 30 passed, no such lines). No test failed.

## Fifth pass: claim widened

The gate rejected `cb7443a8` for one reason only: it changed `app/shortcuts/paletteActions.ts`,
outside the claim. The operator brief of 2026-10-04 adds that file to Owns, so the candidate now
stays inside its claim (plus its own tests and this journal). I made no code changes in this pass.

The branch had been rebased onto `43cf31ce`, so I re-verified on that tree:

- `vitest --config vitest.app.config.ts`: 162 files, 1767 tests passed.
- gm-react `tsc --noEmit`: clean.
- `eslint` on every changed `.ts`/`.tsx` file: clean.
- `format:check:changed --base 43cf31ce`: clean.
- `pnpm gates`: exit 0.
- Playwright `canvas-history`, `canvas-keyboard` and `command-palette` on desktop-chromium and
  mobile-chromium: 50 passed.

## Sixth pass: reconciled onto `9a7b675d`

The operator's rebase onto `9a7b675d` conflicted in `canvas/WidgetFrame.test.tsx`. Since my base,
RC-ENG-10.1 had localised the frame's binding glyph, content-region and resize labels, and added a
Spanish-rendering `describe` block at the end of that test plus `LOCALE_STORAGE_KEY`/`loadCatalog`/
`writePreference` imports. I rebased the branch onto `9a7b675d` myself and resolved it by keeping
both sides: both `describe` blocks, and the integration branch's imports plus this story's
`frameName` import (from `board-helpers`, where the third pass moved it). `WidgetFrame.tsx` merged
cleanly. This story's only lines there are `onSettle` (prop, blur handler, resize-handle Escape),
on top of the localised labels. The file is still 800 lines, at the gate limit.

Verified on the rebased tree:

- `vitest --config vitest.app.config.ts`: 163 files, 1788 tests passed.
- gm-react `tsc --noEmit`: clean.
- `eslint` on every changed `.ts`/`.tsx` file: clean.
- `format:check:changed --base 9a7b675d`: clean.
- `pnpm gates`: exit 0.
- Playwright `canvas-history`, `canvas-keyboard`, `canvas` and `command-palette` on desktop-chromium
  and mobile-chromium: 130 passed.

## Seventh pass: placements recorded per operation

Independent review of `41c742f7` reproduced two placement races with the real core behind a
runtime-shaped dispatcher (one queue, persist, then the dispatch signal):

1. A palette Add tile and a gallery add both queued behind a persisting write: `run` read the state
   before the palette's add executed, then diffed the whole scene, so one gallery Undo destroyed both
   tiles.
2. A palette add that landed between a template Undo's destroys was dropped, because the dispatch
   signal ignored every placement while an undo or redo was replaying.

What changed in `canvas/useLayoutHistory.ts`:

- With a runtime signal available, no placing command (`scene.add-widget`, `scene.apply-template`,
  `scene.duplicate-widget`) is recorded from a scene diff. `run` registers a claim (command, label,
  burst) and the runtime's signal, which fires inside the runtime's own serialization with exactly
  that dispatch's operations, records the step from the operation itself (an add or duplicate names
  its instance; a template's tiles are the last `appliedWidgetCount` of that dispatch's state).
  An unclaimed placement by this device (palette, template picker) is its own step, as before. The
  scene-diff path remains only for a runtime without the signal.
- Undo and redo claim only the placing commands they replay themselves, with no label, so their
  signal records nothing. The blanket `busyRef` early return is gone.
- Undo and redo remove their own entry by identity rather than slicing the top, so an edit recorded
  mid-replay stays on the stack. An undo during which a new action was recorded does not offer redo,
  since that action already closed the redo branch.
- The `sameCommands` dedupe in `remember` is gone: a placement is now recorded exactly once.

Tests: the `useLayoutHistory.test.tsx` harness now queues dispatches and signals after the persist,
the way `SceneRuntime` does (one existing test waits for the queued move instead of reading it
synchronously). Two new regressions match the review's: a gallery add queued behind a palette add
undoes only its own tile, and a palette add made during a template Undo stays undoable (and closes
redo). Both fail on `41c742f7`'s hook and pass now. The reviewer's own config
(`history-races.test.tsx`) passes 3/3.

The review also noted that `canvas-history.spec.ts` lets through `scrollable-region-focusable` on a
widget body region in edit mode. That finding comes from `WidgetRenderSlot` taking an overflowing
body out of the tab order in edit mode. It happens on the base with or without a move, and that file
is outside this story's claim. The view-mode scan in the same spec has no exception.

Verified on the working tree before commit:

- `vitest --config vitest.app.config.ts`: 163 files, 1790 tests passed.
- gm-react `tsc --noEmit`: clean. `eslint` on the changed files: clean.
- `format:check:changed --base 9a7b675d`: clean. `pnpm gates`: exit 0.
- Playwright desktop-chromium and mobile-chromium: `canvas-history`, `canvas-keyboard` and
  `command-palette` (50 passed); `canvas`, `canvas-arrange` and `scene-surfaces` (86 passed).
