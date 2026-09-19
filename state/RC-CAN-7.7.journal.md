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

## Attempt 2 (2026-09-16) — the review's high finding

Independent review rejected `93ddb675` on one high defect. It is real, I reproduced it, and it is
fixed here. Everything else in attempt 1 stands; this attempt touches only the tile menu and the
tests around it.

### The defect

`FlowTileMenu` computed its Width presets from the **tier's** column count (`columns / divisor`,
where `columns = FLOW_COLUMNS[tier]`) but committed them through `flowSpanWidth`, which measures
against the **twelve-column authoring grid**. The two resize paths therefore disagreed: Shift+Arrow
walked the authoring span correctly, the menu did not.

What that looked like, in the reviewer's repro and again in mine:

- at phone (`data-flow-columns=1`) every divisor rounds to span 1, so all four `menuitemradio` rows
  reported `aria-checked=true` at once — an ARIA violation the axe scan cannot see, because axe does
  not count checked radios in a group — and picking "Full width" wrote `w=96`, span 1 of 12. The
  tile came back a twelfth of the screen wide the next time the scene opened on a desktop.
- at rail (6 columns) a half-width tile read back as "Full width", and choosing "Half" wrote span 3.

`checked={span === presetSpan}` compounded it by comparing against `placement.span` — the
tier-clamped, lone-row-stretched span — rather than the durable one.

### The fix

- `board-helpers.ts` gains `flowPresetSpan(divisor)` and the resolved `FLOW_SPAN_PRESETS` table.
  A preset is a **durable** choice, so it takes no tier at all: that is now a compile-time fact
  rather than a convention a future edit could quietly break.
- `FlowTileMenu` no longer receives `span` or `columns`. It reads the tile's own durable span with
  `flowSpanOf(w, AUTHORING_COLUMNS)` and maps `FLOW_SPAN_PRESETS` — so "Half" means half of the
  authored screen at every tier, and exactly one row is checked.
- `AUTHORING_COLUMNS` is now the single name for the grid a durable span is measured against, and
  every span call site in the renderer goes through it. The three `FLOW_COLUMNS.desktop` literals
  that used to say the same thing in different places are gone.

### One more defect the regression test turned up

Writing the phone-tier e2e, the click on "Full width" timed out: _element is outside of the
viewport_. The menu is `position: fixed` at `trigger.bottom + 4`, and for a tile low in the board's
scroll region the whole panel hangs below the fold. `Popover` clamps horizontally, but only for its
own `anchor` placement — a caller-positioned menu like this one gets nothing. So on a phone, where
tiles are full width and the list is long, the Width group was present but unreachable, which is the
one thing "the phone tier collapses to one column and keeps every control" does not allow.

Fixed with `flowPanelPosition` (pure, in `board-helpers.ts`, unit-tested — jsdom rects are all zero,
which is why `popoverShiftX` lives outside its component too) plus a `maxHeight`/`overflowY` wrapper
for the case where the panel is taller than the screen. The measured element is a wrapper div rather
than the panel: `Menu`/`Popover` are React 18 function components with no `forwardRef`, and `Popover`
keeps its own root ref for outside-press dismissal, so a `ref` spread through `...rest` would clobber
it.

### The two review notes worth acting on

- **Un-awaited moves in the renumber fallback.** `reorder` fired N `onMove` calls in parallel.
  `history.run` reads `runtime.state` _before_ dispatching to build its inverse, so overlapping
  dispatches record inverses against a tree that has already moved. They are chained now. The N-undo-
  steps half of the note stands: one `history.run` is one entry, and batching would need an API in
  `useLayoutHistory.ts`, which this story does not own.
- **The 7 + 5 evidence gap.** The acceptance names the Command Center's _current_ arrangement, which
  is `minmax(0,1.5fr) minmax(0,1fr)` — spans 7 + 5, not an even split. That was only asserted at unit
  level; the browser test reproduced 6 + 6. `seedFlowScene` now takes spans and a new e2e seeds the
  real 7 + 5 and asserts the rendered ratio (1.25 < main/side < 1.55; an even split measures 1.0), then
  its rail reflow.

Left as the reviewer described them: the Shift+Arrow announcement already names the authoring grid
(`spanNotice(title, span, 12)`), so a press past the tier's clamp is announced honestly even though
nothing visibly moves; and the two i18n catalog keys remain out-of-claim but additive and in sync.

### File size

`FlowBoard.tsx` went to 798 lines, two under RC-STB-2.7's hard limit — too close to leave. Two things
that were never renderer concerns moved to `board-helpers.ts` (a `.ts`, and the file this story owns
for exactly this): the panel clamp and the preset table. 783 lines now, and both are unit-tested as a
result. The split the attempt-1 journal asked for (`FlowTile`/`FlowTileMenu` into their own file)
still wants doing by whichever story next claims a new file under `app/canvas/`.

### Verification

Run in this worktree at the fixed tree, 2026-09-16.

| Check                                                           | Result                  |
| --------------------------------------------------------------- | ----------------------- |
| `pnpm --filter @dndtools/gm-react typecheck`                    | exit 0                  |
| `pnpm lint`                                                     | exit 0                  |
| `pnpm gates`                                                    | exit 0                  |
| `pnpm format:check:changed`                                     | clean (4 files)         |
| `pnpm test:app`                                                 | 1418 passed / 128 files |
| `flow-layout.spec.ts` + `canvas.spec.ts`, both browser projects | 96 passed               |

The pre-existing `display-face-below-24px 83 vs baseline 84` warn is unchanged and still non-blocking;
`scripts/emphasis-baseline.json` is not in this claim.

### Mutation checks

Each applied at the fixed tree, suite run, then reverted.

| Mutation                                                              | Caught by                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The defect itself: `span`/`columns` props back, presets from the tier | e2e width-menu test — `"Full width" at 900px` expected `false`, got `true` |
| `onSpan(presetSpan)` → `onSpan(1)` (the phone tier's write)           | e2e width-menu test — durable `w` expected 1152, got 96                    |
| The `flowPanelPosition` correction never applied                      | e2e width-menu test — `menu bottom at 900px` expected ≤ 900, got 1080.5    |

The four-simultaneously-checked ARIA state is what the per-row `aria-checked` assertions pin; the
axe scan passes either way, which is why the check is explicit rather than left to the scan.
