# RC-CAN-7.7 run journal

## Scope

The FLOW layout policy from ADR-041: a flow screen lays tiles in a responsive column grid whose
column count comes from the viewport tier, heights follow content, and reading order, DOM order and
focus order are the same order. Drag, keyboard and the tile menu all dispatch the SAME move command.
Resizing picks a column span. Phone collapses to one column and keeps every control.

Owned: `apps/gm-react/src/app/canvas/FlowBoard.tsx` (new), `app/board-helpers.ts`,
`app/SceneBoardModel.ts`, `screens/sceneEditor/index.tsx`. No agents, no dispatcher mutations, no
push, no promotion.

## Attempt 1 (2026-09-16)

### Survey before writing anything

- RC-CAN-7.2 (HEAD, `841f77e3`) already landed the durable half: `Scene.screen.layoutPolicy`,
  `scene.set-layout-policy`, and `screenLayoutPolicy(scene)` exported from `@dndtools/core`. So this
  story needs no core change at all — it is the renderer plus the pure placement model.
- `WidgetFrame.tsx` is **not** in this story's claim, and it is absolutely positioned by contract
  (`position:absolute; left:x; top:y; width; height`, all four required props). A flow tile is the
  opposite: no coordinates, no fixed height. Rather than override its inline styles from outside
  with `!important` — which would be invisible to anyone reading `WidgetFrame` — `FlowBoard` renders
  its own in-flow tile from the SAME parts underneath (`tileMetadataForWidget`, `VisibilityChip`,
  `WidgetRenderSlot`). Nothing under the frame is duplicated; only the frame is.
- `TileActionMenu`'s Move/Resize rows just replay `Enter` on the frame and hand over to the canvas
  keymap — there is nothing there to move a tile in an ORDER. It is also unowned. `FlowBoard` gets
  its own menu whose rows are the flow operations (Move to start/back/forward/to end, Width).
- Two lint ratchets constrain the writing:
  - `dsn/no-raw-style-values` — `gap`/`padding*`/`margin*`/`borderRadius` must be token-backed, and
    no raw colours, in `app/**` and `screens/**`. `sceneEditor/index.tsx` is allow-listed at exactly
    4 and the allowance is a two-sided ratchet (fewer is also an error), so its edits must add and
    remove zero. `FlowBoard.tsx` is new, so it must be at 0.
  - `i18n/no-literal-jsx-text` — JSX text and `label`/`title`/`aria-label` **string literals**.
    Template literals and identifiers are not flagged, which is why `WidgetFrame`/`TileActionMenu`
    keep local English `TEXT` constants. `FlowBoard` follows that neighbouring precedent rather than
    growing the EN+ES catalogs from a file whose siblings are not migrated.
- RC-STB-2.7 hard-fails any `.tsx` under `apps/gm-react/src` over 800 lines, so every pure function
  lives in `board-helpers.ts` (a `.ts`, and the file the story claims for exactly this).

### Design decisions

**Column counts.** `desktop: 12, rail: 6, phone: 1`. Twelve divides by 2, 3, 4 and 6, so halves,
thirds and quarters are all expressible, and the Command Center's current `minmax(0,1.5fr)
minmax(0,1fr)` body reproduces exactly as spans 7 + 5. Desktop is the AUTHORING tier: spans are
stored against it and honoured verbatim there.

**Narrow tiers clamp, they do not scale.** A desktop span is clamped to the tier's column count, not
rescaled proportionally. Proportional scaling would have kept a 6+6 desktop pair two-up at rail —
i.e. it would not reflow, which is precisely what the acceptance asks for. Clamping alone leaves
ragged rows (a span-5 tile alone in a 6-column rail row), so a tile that ends up ALONE in a row at a
narrower-than-authoring tier fills that row. Desktop never stretches, so the authored arrangement is
reproduced there byte for byte.

**Reading order is the durable (y, x) order; a reorder is ONE move command.** Flow keeps the same
`WidgetInstance.layout` the canvas uses — there is no second layout model and no conversion step
(ADR-041: "policy conversion must preserve widget identity, configuration and bindings"). The
reading order is `sort by (y, x, id)`, and packing is a plain non-dense row fill, so DOM order and
visual order cannot disagree. The interesting part is the reorder: rather than renumbering every
tile (which would push N entries onto one undo stack, so a single Ctrl+Z would leave the order half
reversed), `flowReorderMoves` finds a coordinate for the MOVED tile alone that sorts strictly
between its new neighbours:

- between rows (`pred.y < succ.y`): `{ y: pred.y, x: pred.x + FLOW_COLUMN_STEP }` — exact, and with
  no midpoint it cannot degenerate no matter how many times it runs;
- within a row (`pred.y === succ.y`): the x midpoint, which is the only case that can exhaust double
  precision. When it does, the function falls back to a full canonical renumber. Both paths are
  tested.

**Resizing never reorders.** A span changes `w` only; the order key is `(y, x)`. That is a property
worth stating because it is what lets the span control live on the same tile as the move control
without the tile jumping out from under the pointer.

**Flow ignores `SceneSummary.focusOrder`.** ADR-041 requires reading, DOM and focus order to be the
same order, so a per-widget focus-order override would break the policy's one invariant. The canvas
policy keeps it. `FlowBoard` takes no `focusOrder` prop at all, so this is a compile-time fact
rather than a comment.

### What landed

- `app/board-helpers.ts` — the pure flow model: `FLOW_COLUMNS`, `FLOW_COLUMN_STEP`,
  `FLOW_ROW_STEP`, `flowOrder`, `flowSpanOf`, `flowSpanWidth`, `flowPlacements`, `flowKeyBetween`,
  `flowReorderMoves`, `flowRenumber`.
- `app/SceneBoardModel.ts` — `FlowBoardProps` (the flow prop contract, beside the canvas's) and
  `FlowDrag` (the flow gesture type, beside the canvas's `Drag`).
- `app/canvas/FlowBoard.tsx` (new) — the renderer: a CSS grid with explicit
  `gridColumn`/`gridRow` from `flowPlacements`, in-flow tiles with content-driven heights, roving
  tabindex over the reading order, pointer drag-to-reorder, the keyboard reorder and span keys, and
  the per-tile flow menu.
- `screens/sceneEditor/index.tsx` — reads `screenLayoutPolicy(rawScene)`, renders `FlowBoard` or
  `SceneBoardCanvas` accordingly, and gains the Layout radiogroup that dispatches
  `scene.set-layout-policy`.
- `i18n/messages/en.ts` + `es.ts` — five `sceneEditor.layout*` keys for the policy picker. Not in
  the claim, but `sceneEditor/index.tsx` is a fully migrated file (no `no-literal-jsx-text` allowance
  at all), so leaving English literals in its toolbar would have been a real regression. Additive
  keys only; the ES catalog's 95% coverage gate still passes.
- `app/flow-layout.test.ts` (new) — 26 unit tests for the model.
- `tests/e2e/flow-layout.spec.ts` (new) — reflow at the three tiers, the keyboard reorder, the drag
  and menu reorders, an axe scan, and the no-clipping check.

### Two things this story deliberately did NOT do

- **`WidgetFrame`, `TileActionMenu` and `Inspector` are untouched.** The Inspector's S/M/L size
  presets still write raw widths on a flow screen. That is not broken — any width reads back as a
  span — but it is not span-aware, and the Inspector belongs to no part of this claim. Worth a
  CAN-7 follow-up when the screen editor is built out (7.3).
- **`FlowBoard.tsx` is 748 lines**, under RC-STB-2.7's 800-line hard limit but over its 500-line
  soft target, so it prints a warn alongside the other 18 files that do. Splitting the tile out
  would mean a second new file in `app/canvas/`, which the claim does not cover; the next story to
  touch it should split `FlowTile`/`FlowTileMenu` out rather than grow this file.

### Verification

Run in this worktree, 2026-09-16. Nothing here is a claim about a gate the operator has not run.

| Check                                                                                             | Result                  |
| ------------------------------------------------------------------------------------------------- | ----------------------- |
| `pnpm --filter @dndtools/gm-react typecheck`                                                      | clean                   |
| `pnpm lint` (eslint + raw-style ratchet + boundary + emphasis + a11y contrast)                    | exit 0                  |
| `pnpm gates`                                                                                      | exit 0                  |
| `pnpm format:check:changed`                                                                       | clean (9 files)         |
| `pnpm test:app`                                                                                   | 1412 passed / 128 files |
| `pnpm test:tooling`                                                                               | 187 passed / 25 files   |
| `flow-layout.spec.ts`, desktop-chromium + mobile-chromium                                         | 10 passed               |
| `canvas` + `starter-widgets` + `scene-cards` + `note-depth` + `custom-widgets` e2e, both projects | 126 passed              |

Pre-existing, not caused by this change: `lint:emphasis` reports `display-face-below-24px 83` against
a baseline of `84` and asks for the baseline to be lowered. Reproduced on a stashed (clean) tree at
`841f77e3`, so some earlier story removed a usage without lowering its entry. It is a warn, `pnpm
lint` still exits 0, and `scripts/emphasis-baseline.json` is not in this claim — left alone.

### Mutation checks on the load-bearing assertions

Each mutation was applied, the suite run, then reverted.

| Mutation                                                                               | Caught by                                                                                                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `flowPlacementsForOrder` returns before the lone-row stretch                           | "reflows that arrangement to one tile per row at rail, each filling the row"                                          |
| `flowSpanOf` rescales proportionally instead of clamping                               | "clamps a span to the tier…" **and** "reflows an even two-column row at rail rather than shrinking it to stay two-up" |
| `flowReorderMoves` always renumbers instead of taking the single-tile key              | both "ONE move command" tests                                                                                         |
| `FlowBoard`'s selected-tile arrow announces the new position but never calls `reorder` | e2e "a keyboard reorder dispatches a durable move and survives a reload"                                              |

The proportional-rescale mutation initially failed only the unit-level `flowSpanOf` test — the
acceptance-bearing rail-reflow case still passed, because 7 + 5 rescales to 4 + 3, which still
overflows six columns. The even 6 + 6 case was added specifically to close that: it rescales to
3 + 3, stays two-up at rail, and so is the case that actually distinguishes clamping from rescaling.

### One thing the browser taught the test

The first drag e2e aimed at a bounding box measured BEFORE `mouse.down()`, and failed. The press
selects the tile, a selection opens the Inspector beside the board, and the grid reflows under the
pointer — so the drop point was where the tile used to be. The behaviour is the scene editor's, not
flow's (the canvas does the same), so the test re-measures after the Inspector appears rather than
the screen suppressing the reflow.
