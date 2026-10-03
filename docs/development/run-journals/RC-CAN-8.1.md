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
  `record` puts a command dispatched elsewhere on the stack. `inverseCommands` inverts placing
  commands (`scene.add-widget`, `scene.apply-template`, `scene.duplicate-widget` without `copyId`)
  by diffing the state after: one `scene.destroy-widget` per new tile, plus a `scene.update-metadata`
  restoring the background when a template replaced it on an empty scene. Redo of a destroy is the
  tombstone restore, so redo brings back the same instances. Undo and redo close any open burst.
- `SceneBoardCanvas`: pointer drafts clear when their commit settles and on any undo/redo. Arrow
  and Shift+Arrow nudges (and the resize handle's arrows) open a burst; Escape on the frame, focus
  leaving the frame, the handle's Escape, a new pointer gesture, undo and redo close it. Pending
  nudge targets (never painted) let fast presses build on each other. Pointer group drags and
  arrange actions are one step each.
- `WidgetFrame`: `frameName` builds the accessible name from the received layout; new `onSettle`.
- `board-helpers`: `BOARD_TILE_SIZE`, `defaultTileSize` (the one default-size table: 240px column
  spans and at least 160 high on the board and flow, the definition default on the free canvas) and
  `addTileCommand`.
- `Board`: gallery adds go through `addTileCommand` and `history.run`; the palette surface gets
  `record`; the template picker gets `history`.
- Outside the owned list, kept minimal: `registry.ts` (`CanvasSurfaceHandle.record`),
  `paletteActions.ts` (size from the table, `record` after the dispatch), `TemplatePicker.tsx`
  (optional `history`, `record` on acceptance), `AddWidgetGallery.tsx` (slot search uses the table),
  `sceneEditor/index.tsx` + `useSceneCommands.ts` (same wiring for `/scene/:id`), and the
  `sceneEditor.history.added` string in en/es plus the regenerated `qps-ploc.ts`.
- `paletteRows.ts` needed no change: it builds the screen navigation rows, not Add tile.

## Evidence

- New unit tests: `SceneBoardCanvas.test.tsx` (clamped drop then Undo/Redo: frame position equals
  the state layout; three nudges + Escape + Ctrl+Z restore), `shortcuts/paletteActions.test.tsx`
  (palette Add tile lands 240×160, Undo removes it, Redo restores the same id), five new
  `useLayoutHistory` cases (bursts, add, recorded template, template background), and `frameName`
  printing "size 240 by 160" in `WidgetFrame.test.tsx`. All three `SceneBoardCanvas` tests fail
  against the old canvas.
- New e2e `canvas-history.spec.ts`, both profiles: drag past the edge, Undo, the canvas screenshot
  matches the pre-drag capture (per-channel tolerance 8 for Chromium's ±1 anti-aliasing at rounded
  corners; Undo/Redo cluster masked); keyboard move, Escape, Ctrl+Z restores; axe clean. Both tests
  fail on desktop against the old canvas.
- The edit-mode axe scan excludes `[data-widget-region]`: on the phone the Prep tile's body overflows
  and `WidgetRenderSlot` gives its scroll region `tabindex=-1` in edit mode, which axe reports as
  `scrollable-region-focusable` with or without this change. The full board, bodies included, is
  scanned clean in view mode afterwards. That finding belongs to the body (and to CAN-8.2's resize).
- Playwright, desktop-chromium and mobile-chromium: `canvas`, `canvas-keyboard`, `canvas-arrange`,
  `command-palette`, `flow-layout`, `scene-surfaces` and `canvas-history` specs, 150 passed (run
  before the template-background inverse was added).
- `vitest --config vitest.app.config.ts`: 162 files, 1762 tests passed (before the template
  background case was added; that file passes 11/11 on its own). `tsc --noEmit`, `eslint` and
  `prettier --check` on the changed files pass.
