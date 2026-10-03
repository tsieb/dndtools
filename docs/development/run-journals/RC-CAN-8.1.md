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

- A palette "Add tile" is undoable but still lands at the definition's own size (220×160 for most
  tiles): `paletteActions.ts` builds that layout. Sizing it from `defaultTileSize` is a two-line
  change there.
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
