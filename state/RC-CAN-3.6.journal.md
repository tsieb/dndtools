# RC-CAN-3.6 run journal

## Implementation

- Headroom tools were not used; every result below is from native, uncompressed command output.
- Core (additive): `scene.set-widget-order` takes the scene's whole back-to-front order, which has to
  be an exact permutation of its widgets. It reorders `Scene.widgets` (the array the canvas paints in)
  and renumbers `z` to 1..n, so paint order and focus order agree. `scene.group-widgets` gains an
  optional `ungroup: true`. `scene-state.ts` adds `widgetPaintOrder`/`withWidgetOrder`, and
  `layout-commands.ts` adds an `ungroup-selection` descriptor plus `resolveSelectionLayoutCommand`
  and `resolveWidgetOrderCommand`. The schema, command type, dispatch case and barrel edits are all
  in companion paths.
- `app/canvas/geometry.ts` (new, pure): fully-enclosed marquee selection, align
  left/center/right/top/middle/bottom against the selection bounds, and distribute. Distribute keeps
  the outer tiles fixed and evens the gaps; when the tiles are too wide for the span it spaces their
  centres instead. Also bring forward/backward and to front/back, toggle selection, group-mate
  expansion, the arrange shortcut map, and the extent, draft-settle and zoom-about-point arithmetic
  I moved out of the canvas.
- Canvas: the host still owns one `selectedId`, and the canvas holds the rest of the selection.
  Shift+Space, Shift/Ctrl-click and the marquee add tiles to it. The marquee is an empty-board drag
  on `/board`, or Shift+drag on the free canvas, where a plain drag still pans. Arrows and pointer
  drags move the whole selection. Selecting a grouped tile selects its group. Alt+A/H/D/W/V/S align,
  Alt+Shift+H/V distribute, Ctrl+]/[ (with Shift: to front/back) change the layer, Ctrl+G and
  Ctrl+Shift+G group and ungroup, and Ctrl+A selects all. Once two or more tiles are selected, an
  `ArrangeBar` toolbar offers every action as a button, with `aria-keyshortcuts` set.
- Inspector: a new "Position and size" panel with numeric X/Y/Width/Height fields that commit on
  blur or Enter. Width and height follow the existing resizable gate.
- Size gate: `SceneBoardCanvas.tsx` was 800 lines and is now 784. `HistoryCluster` and `EmptyCanvas`
  moved to `WidgetFrame.tsx`, pure math moved to `geometry.ts`, and I shortened some long comments.
  Two raw-style allowances moved with the cluster (canvas 2 → 0, WidgetFrame 4 → 6; net zero). The
  moved empty-state heading switched from the display face to sans at the same size, because the
  RC-ENG-8.4 emphasis lint only grandfathers display-face-under-24px in the canvas file.

## Deviations and follow-ups (for the operator)

- **Rotation is not implemented.** `WidgetLayout` has no rotation field. Adding one means schema,
  hydrator and render changes, and would complicate the marquee and align math. The panel covers
  x/y/w/h.
- **Undo coverage:** align and distribute record one `scene.move-widget` per tile, so undo reverses
  one tile per step. `scene.set-widget-order` and group/ungroup are not undoable yet:
  `lifecycle/widget-undo.ts` (not owned) has no inverse for them. `docs/architecture/SCENE_HISTORY.md`
  now says so.
- **Unowned host wiring:** the canvas reaches `sceneId`/`actorId` for layer and group through
  `useRuntime()`, the same way `WidgetFrame` already does, because `SceneBoardModel.ts`, `Board.tsx`
  and `sceneEditor/index.tsx` are outside the claim. For the same reason the Inspector's X/Y fields
  fall back to a direct `scene.move-widget` dispatch, which is not undoable. The fix is one line in
  `sceneEditor/index.tsx`: `onMove={(x, y) => move(selectedInstance.id, x, y)}`.
- **The new keys are not in `shortcuts/registry.ts` (not owned),** so the Settings shortcut list
  does not show them. They are documented in the frame `aria-description`, the toolbar button
  titles/`aria-keyshortcuts`, and `geometry.ts`.
- `pnpm lint:emphasis` now reports the canvas's display-face baseline could drop from 1 to 0
  (`scripts/emphasis-baseline.json`, not a companion path). This is informational, not a failure.

## Validation

- Core: `pnpm test:critical` 278 files / 4866 tests passed, including the new
  `packages/core/tests/widget-order.test.ts`.
- App: `pnpm test:app` 137 files / 1510 tests passed, including the new
  `app/canvas/geometry.test.ts` (16 tests).
- Tooling: `pnpm test:tooling` 26 files / 193 tests passed, after the emphasis fix above.
- `pnpm typecheck` passed, `pnpm lint` passed, and `pnpm gates` passed (6 gates; canvas under 800).
  `format:check:changed -- --base origin/loop/rc` is clean, and a Prettier check on the new
  untracked files is clean.
- Playwright (`DNDTOOLS_E2E_PORT=5743`, desktop + mobile): the new `canvas-arrange.spec.ts` builds
  three notes, selects them with Space/Shift+Space, aligns them by keyboard (Alt+A then Alt+W), and
  layers one with Ctrl+] and Ctrl+Shift+[. It runs axe with and without the toolbar. The batch
  a11y-axe-gate, canvas-keyboard, canvas, combat-tile, custom-widgets, flow-layout, map-tile,
  note-depth, responsive, scene-cards, shortcuts, starter-widgets, widget-builder and
  authoring-layout gave 355 passed and 5 skipped. After the final edits, canvas-arrange,
  canvas-keyboard, canvas and a11y-axe-gate gave 140 passed.
- I did not run the full Playwright suite or a production build. `loop/rc` is 6 commits ahead,
  touching docs only, with no overlap with these files.

## Attempt 2 (2026-09-18)

- Gate feedback: `Format (changed)` failed on `packages/core/src/queries/layout-commands.ts` and
  `packages/core/src/state/scene-state.ts`. Attempt 1 ran `format:check:changed` against
  `origin/loop/rc` before the new files were committed, so it checked 11 files instead of 20 and
  missed both.
- `layout-commands.ts` was already unformatted on the base (`6a745225`): its
  `resolveLayoutCommandPayload` switch uses one-line `return` statements that Prettier wraps. Because
  the gate checks whole changed files, the fix reformats those pre-existing lines too. Prettier
  changed layout only, not logic. `scene-state.ts` needed a single line of my own `withWidgetOrder`
  wrapped.
- Validation: `pnpm format:check:changed -- --base loop/rc` checks 20 files and is clean. Core
  `tsc --noEmit` is clean. The widget-order, layout-accessibility and widget-layout tests pass.
