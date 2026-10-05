# RC-CAN-8.3 — Direct manipulation cues: hover, grip, guides, context menu

Run journal for the implement pass on `dispatch/dndtools/f15a504e15e1d117156a`, based on `5bcd0e60`
(the RC-CAN-8.1 head, equal to `loop/rc` at the start).

## Constraints found before writing code

- `WidgetFrame.tsx` was at 800 lines, `SceneBoardCanvas.tsx` 790 and `FlowBoard.tsx` 777, against the
  800-line hard limit (RC-STB-2.7). New code has to be paid for by moving code between owned files.
- `no-raw-style-values` allows `WidgetFrame.tsx` exactly 6 raw values and every other owned file 0; a
  file reporting FEWER than its allowance also fails (stale allowance), and the allow-list is not in
  the claim. So the six raw values in `WidgetFrame.tsx` (the history cluster's `gap`/`padding`, the
  status note's `gap`, the selection chip's `gap`/`padding`, the resize handle's `padding`) stay where
  they are, and everything new is token-backed.
- `no-literal-jsx-text` allows `FlowBoard.tsx` exactly 2 (its two templated `aria-label`s), so new
  flow copy goes through `TEXT` constants, not attribute templates.
- The hosts (`Board.tsx`, the scene editor) are outside the claim, so "docked in the toolbar" has to
  be done inside the surfaces themselves.

## Change

- **Hover lift and outline** (`WidgetFrame.tsx` `liftStyle`/`useHoverLift`/`LIFT_TRANSITION`, used by
  both canvas frames and flow tiles). In edit mode, a mouse or pen hovering a tile gives it an
  `--color-accent-border` outline (unless a selection or drop ring is already drawn) and
  `--shadow-md`. A dragged tile casts `--shadow-lg`. The transition is `outline-color`/`box-shadow`
  on `--duration-fast`/`--easing-standard`, which collapse to 0ms under `data-motion="reduced"|"none"`,
  so reduced motion gets a static cue. A finger never lifts a tile. View-mode markup is unchanged
  (the header snapshots still pass).
  - The first version also raised the tile 2px with `transform`. `canvas.spec.ts:1782` (mobile)
    then failed 4/4 where the base passed 3/3. Instrumenting it showed why: on the free canvas,
    moving a frame that holds the focused menu trigger made Chrome scroll the overflow-hidden canvas,
    and the tile menu closes on any scroll. The lift is now elevation only.
- **Grip** (`TileGrip`): a `drag-handle` glyph in the title bar, drawn on the drag surface (the title
  row leaves it room). It is `touch-action: none`, so a finger on it drags; the rest of a tile still
  scrolls the board or screen.
- **Right-click and long-press** open the existing tile menu at the pointer. `TileActionMenu` and
  `FlowTileMenu` expose `MenuHandle.open(at?)`; with a point, the panel opens rightwards from it,
  clamped to the viewport. `useLongPress` (in `TileActionMenu.tsx`) opens it after 500ms of a still
  touch (8px slop), and first raises `pointercancel` on the window, which both boards already treat
  as "abandon the gesture", so the tile does not move. A right press never starts a move and never
  reaches the canvas. Shift+F10 / ContextMenu still open the menu under its trigger. A `contextmenu`
  from inside the portalled menu (React bubbling) is ignored.
- **Snap guides and distance hints** (`geometry.ts` `dragGuides`, `alignTo`; drawn by
  `surfaceA11y.tsx` `DragGuides`). While a tile is dragged, every left/centre/right and
  top/middle/bottom line it shares with a still tile is drawn as a dashed accent line spanning both,
  and the gap to the nearest overlapping tile on each side is drawn with its distance. Lines and
  labels are divided by the zoom scale, so they stay one screen pixel wide and readable at Fit. With
  Snap on, a still tile's line within 6 screen px wins over the 20px grid. Without that, the grid
  pulled seeded tiles (laid out at 24px offsets) off their neighbours' lines, and no guide ever showed.
- **Selection chip inside the frame**: bottom-left inside the frame, held at screen size and capped
  to the frame's width, instead of `top: -26` over the canvas edge.
- **Flow drag** (`FlowBoard.tsx`): the existing drag now has a drop indicator, a 4px accent bar in
  the grid gap before or after the target (above/below a full-row tile), on top of the dashed target
  ring. It still lands in `reorder`, the one `scene.move-widget` path the menu and keyboard use, so
  Undo restores it. On a phone, selecting on the press opened the scene editor's Inspector over the
  board and hid every drop target. A touch press now selects on release, and only when it did not
  reach another tile. Mouse presses still select immediately, which `flow-layout.spec.ts` relies on.
  A right press does not select (selecting opened the Inspector, which took focus and closed the
  menu).
- **Undo cluster docked in the toolbar**: flow's Undo/Redo moved from a cluster stuck to the bottom of
  the scroll region (over the last tile on a phone) to a sticky `role="toolbar"` row, "Layout
  history", above the tiles. It also carries the hint the frame lacked: "Drag a tile by its grip to
  reorder it, or select it and use the arrow keys."
- **Code moved to stay under 800 lines**, no behaviour change: `ArrangeBar`, `Marquee` and the
  section bands (`SectionBands`, formerly inline in `SceneBoardCanvas`) moved to `surfaceA11y.tsx`;
  `FlowTileMenu` moved from `FlowBoard.tsx` to `TileActionMenu.tsx`. After: `WidgetFrame.tsx` 727,
  `SceneBoardCanvas.tsx` 773, `FlowBoard.tsx` 662, `TileActionMenu.tsx` 717, `surfaceA11y.tsx` 345,
  `geometry.ts` 388.

## Not done, and why

- The canvas's own Undo/Redo cluster (`HistoryCluster`, top-right of `/board`) is unchanged. The
  "floats over the last tile" finding (CAN-14) is the flow screen's, which is fixed above. Docking
  the canvas cluster into the board's header toolbar needs `Board.tsx` or the scene editor's toolbar,
  and both are outside the claim. Docking it inside the canvas would offset every tile on the bounded
  board.

## Evidence

- New e2e `canvas-cues.spec.ts`, desktop-chromium and mobile-chromium. On `/board` edit: the hovered
  capture differs from rest and returns to pixel-identical on leave; right-click opens the tile menu
  at the pointer and the menu and board are axe-clean; a long-press through CDP touch (touch profile
  only) opens the menu and leaves the layout unchanged; a drag shows guide lines and gap labels, and
  the selection chip stays inside its frame. On a flow screen: a drag by the grip (mouse on desktop,
  CDP touch on the phone) shows the drop indicator on the right side, reorders the DOM and the
  durable order, and toolbar Undo restores both; the toolbar sits above the first tile and does not
  overlap the last tile scrolled into view; right-click opens the flow tile menu, and the edited
  screen is axe-clean with `best-practice`.
- Unit: `geometry.test.ts` (guides, gaps, the magnet) and `WidgetFrame.test.tsx` (grip, mouse-only
  lift with no transform, right-click at the pointer without a move, long-press at 500ms with
  `pointercancel`, a moving finger cancels it, the chip's position and cap).
- `canvas.spec.ts:1782` (Configure… from the tile menu on `/scene/:id`, mobile) failed 4/4 with the
  transform lift and passes now; it passes 3/3 on the base.

Verified on the working tree before commit:

- Playwright, desktop-chromium and mobile-chromium: `canvas-cues`, `flow-layout`, `canvas-history`,
  `canvas-keyboard`, `canvas`, `canvas-arrange`, `command-palette`, `scene-surfaces`,
  `custom-widgets`, `a11y-axe-gate`, `screens`, `phone-navigator`, `responsive` and
  `scene-editor-polish`: 457 passed, 5 skipped (17.3 min). After the last two small edits (hover
  enter counted only while editing; a comment move), `canvas-cues`, `flow-layout` and
  `canvas.spec.ts:1782` were re-run on both profiles: 29 passed, 1 skipped (the long-press test on
  the desktop profile, which has no touch).
- `vitest --config vitest.app.config.ts`: 165 files, 1941 tests passed (and the canvas files again
  after the last edits: 127 passed).
- gm-react `tsc --noEmit`: clean. `eslint` on every changed file: clean. `prettier --check`: clean.
- `pnpm gates`: passed. `pnpm lint:emphasis`: display-face 26, multiple-accent-primaries 47, the
  same as on the base, so the baseline is not raised. `pnpm a11y:contrast`: passed.
- Ratchets: `no-raw-style-values` still 6 in `WidgetFrame.tsx` and 0 in the other owned files;
  `no-literal-jsx-text` still 2 in `FlowBoard.tsx`.

## Second pass: visual gate on `11cb6459`

The operator's rebase put this story on `4ed8b451` (head `11cb6459`). The pinned-container visual
gate then failed 3 of 489 tests, all in `visual-rail` on routes this story does not touch:

- `characters-polish.spec.ts:10` (characters empty, dungeon): the empty-state illustration was
  never found within 5s;
- `community.spec.ts:79` (community, tavern) and `plans-legal.spec.ts:29` (plans account check,
  parchment): `toHaveScreenshot` timed out at "waiting for element to be stable".

None of them is a pixel diff. The desktop twins of the first two took about 17s in the same window
(normally 3–4s), which points to a loaded machine or a cold dev-server chunk (the known
visual lazy-chunk stall). The other 486 passed, including every `/board` and `/scene` golden.

Re-run on `11cb6459` with `tests/visual/run-in-container.sh` for the three specs, every visual
project, `--repeat-each=2`: 120 passed, 0 failed (2.3 min). No baseline was changed and no code
changed in this pass.
