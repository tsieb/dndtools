# Completion — UX-CANVAS-widget-manipulation-and-outline

UX workpack status: `complete`

Epic: Widget Placement, Manipulation, and Outline (phase "03 Canvas and Command Center", P0).
Requirement coverage: `UX-CANVAS-002` (`UX-CANVAS-002-S01`), `UX-CANVAS-003` (`UX-CANVAS-003-S01`),
`UX-CANVAS-004` (`UX-CANVAS-004-S01`), `UX-CANVAS-005` (`UX-CANVAS-005-S01`), `UX-CANVAS-006`
(`UX-CANVAS-006-S01`), `UX-CANVAS-009` (`UX-CANVAS-009-S01`), `UX-CANVAS-012` (`UX-CANVAS-012-S01`),
`UX-CANVAS-015` (`UX-CANVAS-015-S01`).

## Summary

Built the **editor layer** that turns the reusable viewport runtime (delivered by
`UX-CANVAS-viewport-rendering-and-performance`) into a direct-manipulation production canvas tool:
widget placement from a searchable library, single/multi/marquee selection, keyboard- and
panel-driven move/resize/rotate, grouping, z-order, alignment + distribution + grid/smart-guide snap,
a reversible undo/redo history, and a full canvas keyboard model — all integrated with the Scene
Outline, which now doubles as the layers/selection panel.

A new pure-model package `apps/v2/app/src/lib/gui/ux-canvas/` (`selection`, `transform`, `alignment`,
`z-order`, `undo-stack`, `widget-library`, `canvas-shortcuts`) holds the geometry/history/catalogue
math, with a single reactive `CanvasManipulationController` (`manipulation-controller.svelte.ts`)
wiring it to `$state`, dispatch, and the shared live announcer. The controller **holds no shadow copy
of the scene**: it reads the current viewer-filtered widget list through an injected accessor and
turns every manipulation intent into the SAME processing-core command a pointer drag would dispatch
(`scene.move-widget` / `resize-widget` / `layer-widget` / `configure-widget` / `group-widgets`),
recording a reversible entry for each — so the processing core stays the single source of truth and
the model is unit-testable with fakes.

The render engine is unchanged: this epic consumes the DOM/CSS baseline behind the existing
`ViewportController` abstraction (architecture-decisions §4 / ADR-014 / doc16 §10.1) and does **not**
introduce a WebGL/Canvas/Pixi/Konva engine.

## Demo path / surfaces

`/scenes` → create a player-visible Scene → open it (`/scene/:id`). The canvas command bar (DM only)
exposes the widget library, selection toolbar, transform panel, alignment/z-order controls, undo/redo,
and the keyboard-shortcuts reference; the Scene Outline below acts as the layers panel.

- **Desktop (expanded):** full keyboard model (arrows nudge, Shift/Ctrl modifiers, `Ctrl+A` select-all,
  `Ctrl/Cmd+G` group, `Ctrl/Cmd+Arrow` reorder from the outline, `Ctrl+Z`/`Ctrl+Y` undo/redo, `?`
  shortcuts help), plus pointer marquee and the on-screen toolbar.
- **Tablet (medium):** the numeric transform panel (WCAG 2.5.7 alternative) commits move/resize/rotate
  without a drag; toolbar buttons and the checkbox-driven "Group selected" path are touch-reachable.
- **Mobile (compact):** every Must-have manipulation is reachable through the transform panel, the
  selection toolbar, the widget library, and the outline — no action is gesture-only, pointer-only, or
  desktop-only (verified on `mobile-chromium`).

Reuse: selection state is a `SvelteSet`; the outline keyboard path reuses the existing
roving-tabindex + live-announcer a11y primitives; placement availability reuses the platform-profile
capability check (CMD-005 "list, don't hide"); pointer/keyboard parity follows the canvas-keyboard
helper conventions established by the viewport epic.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-CANVAS-002** placement / insert flow (library, search, Escape cancel; unavailable listed not hidden) | `widget-library.ts` (catalogue + availability), `WidgetLibrary.svelte`, `open-widget-library`; placement lands the widget selected | `ux-canvas-library.test.ts`; e2e "library placement…", "library lists widgets (unavailable shown not hidden) and Escape cancels" |
| **UX-CANVAS-003** move + resize (keyboard nudge, numeric panel, grid snap) | `transform.ts` (`MOVE_STEP*`/`RESIZE_STEP*`/`clampSize`), controller `moveTo`/`nudge`/`resizeTo`/`resizeStep`, `TransformPanel.svelte` | `ux-canvas-transform.test.ts`, `ux-canvas-controller.test.ts`; e2e keyboard move + transform-panel move |
| **UX-CANVAS-004** rotation (15° snap, free 1°, reset) | `transform.ts` `snapRotation`, controller `rotateTo`/`rotateBy`/`resetRotation` (persists `configuration.rotation`), `TransformPanel` rotation field | `ux-canvas-transform.test.ts`, `ux-canvas-controller.test.ts`; e2e transform-rotation |
| **UX-CANVAS-005** selection: single / multi / marquee / select-all | `selection.ts` (`applySelection`/`applyBatchSelection`/`marqueeRect`/`marqueeHits` fully-enclosed rule/`selectAllIds`/`selectionBounds`), controller `select`/`selectAll`/`clearSelection`/`marquee`, `SelectionToolbar.svelte`, `CanvasViewport` marquee, outline integration | `ux-canvas-selection.test.ts`, `ux-canvas-controller.test.ts`; e2e select-all + no-leak |
| **UX-CANVAS-006** grouping + z-order | `z-order.ts` `resolveZOrder` + controller `zOrder`; grouping via `scene.group-widgets` (`Ctrl/Cmd+G` and the checkbox "Group selected" button); Scene Outline `Ctrl/Cmd+Arrow` reorder | `ux-canvas-zorder.test.ts`; e2e z-order toolbar, outline `Ctrl+ArrowUp` reorder, grouping shortcut listed |
| **UX-CANVAS-009** alignment, grid, smart guides | `alignment.ts` (`alignWidgets`/`distributeWidgets`/`snapToGrid`/`DEFAULT_GRID`/`SnapGuide` with Alt override), controller `align`/`distribute`, grid/snap settings (`gridEnabled`/`gridSize`/`snapEnabled`) | `ux-canvas-alignment.test.ts`; e2e align-left |
| **UX-CANVAS-012** undo / redo (reversible history, labels, limit) | `undo-stack.ts` `UndoStack`, controller `#commit`/`undo`/`redo`/`#syncHistory`, `canvas-undo`/`canvas-redo` buttons with descriptive `aria-label` | `ux-canvas-undo.test.ts`, `ux-canvas-controller.test.ts`; e2e move→undo→undo→redo |
| **UX-CANVAS-015** canvas keyboard model + focus management | `canvas-shortcuts.ts` (intent resolution) + `KeyboardShortcutsHelp.svelte` (`?` reference table), controller keyboard ops, focusable `canvas-viewport`, outline roving navigation | `ux-canvas-controller.test.ts`; e2e keyboard move, `Ctrl+A`, shortcuts-help open/close |

## Keyboard + non-gesture alternative evidence (platform parity)

Every Must-have manipulation is reachable without a gesture, without a pointer, and without a desktop —
proven on both `desktop-chromium` and `mobile-chromium`:

| Action | Keyboard | On-screen (non-gesture) pointer | Gesture |
|---|---|---|---|
| Place widget | library (Enter on item) | widget-library list | — |
| Select / multi-select | `Ctrl+A`, outline option focus + Enter | outline rows, tile click | marquee drag |
| Move / resize | arrows / Shift+arrows; transform-panel field | transform panel; alignment toolbar | drag |
| Rotate | transform-panel rotation field | transform panel | — |
| Group / z-order | `Ctrl/Cmd+G`, `Ctrl/Cmd+Arrow` (outline) | "Group selected" button, `z-back`/z-order toolbar | — |
| Align / distribute | (toolbar via keyboard) | `align-*` toolbar buttons | — |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` | `canvas-undo` / `canvas-redo` buttons | — |

## Actor-safety / no-leak evidence

The controller only ever receives the **viewer-FILTERED** widget list the host passes in (the same set
the canvas tiles and Scene Outline derive from). A DM-only widget is therefore never selectable, never a
marquee or select-all target, never moved/aligned/reordered, and never named in an announcement for a
non-DM viewer. The manipulation command bar and selection toolbar render **only for the DM**; players
and observers see neither.

E2E `actor no-leak` (both profiles) proves it end-to-end: a player-visible note and a DM-only `map`
widget bound to `forbidden-vault` are created; as DM, `Ctrl+A` reports "2 selected"; after switching the
rendered actor to a player, the `canvas-command-bar` and `selection-toolbar` are absent, only one tile
renders, the outline count drops to "1 widget", and the string `forbidden-vault` appears nowhere in the
scene editor. The axe scan of the manipulated route reports no critical/serious violations.

The one edit to a shared actor-safety surface — `SceneOutline.svelte` — is strictly **additive and
opt-in**: the new `selectedIds`/`onselect`/`onreorder` props default to undefined and, when omitted,
preserve the original read-only structural outline; the `viewer.role === 'dm'` visibility-badge gate is
untouched. The `player-view-projection.spec.ts` edit only scopes a checkbox selector to the widget grid
so it is not ambiguous with the new "Snap to grid" toggle (no behavioral/security change).

## Tests / gates run

- Targeted vitest (the 7 new `ux-canvas-*` specs): **73 tests pass**.
- Full app vitest — **417 tests pass (50 files)** (includes the 7 new files).
- Core vitest — **2849 tests pass (182 files)** (unchanged; sanity).
- `pnpm v2:typecheck` (core `tsc` + app `svelte-check`) — **0 errors, 0 warnings (4661 files)**.
- `pnpm lint` (eslint + `lint:navigation` + `lint:tokens` + `a11y:contrast` + `audit:repo`) — **PASS**.
  (Fixed 5 `svelte/prefer-svelte-reactivity` errors: transient `Set`/`Map` locals in the controller
  switched to `SvelteSet`/`SvelteMap`, matching house style — the codebase has no disable comments for
  this rule.)
- `pnpm docs:validate` — **PASS**.
- `pnpm a11y:axe` — **PASS (16/16, both profiles)** against the empty known-violations register.
- Playwright `canvas-manipulation.spec.ts` — **12 pass** (6 × desktop-chromium + 6 × mobile-chromium),
  including the actor no-leak boundary and an axe scan of the manipulated route.
- Full Playwright suite (both profiles) — **647 passed, 31 skipped, 0 failures**. The two known
  pre-existing flakes (`character-creation-and-drafts` CHAR-002 mobile; `scene-create` Timer under
  combined session-state runs) did not surface; no regression introduced by this epic.
- `pnpm v2:ux-workpack:validate` — **PASS** (after `complete`; no generated-file drift).

## Files changed

New — pure editor models + reactive controller (`apps/v2/app/src/lib/gui/ux-canvas/`):
- `selection.ts`, `transform.ts`, `alignment.ts`, `z-order.ts`, `undo-stack.ts`, `widget-library.ts`,
  `canvas-shortcuts.ts`, `manipulation-controller.svelte.ts`, `index.ts`

New — editor surfaces:
- `WidgetLibrary.svelte`, `SelectionToolbar.svelte`, `TransformPanel.svelte`, `KeyboardShortcutsHelp.svelte`

New — tests:
- `apps/v2/app/tests/unit/ux-canvas-selection.test.ts`, `ux-canvas-transform.test.ts`,
  `ux-canvas-zorder.test.ts`, `ux-canvas-undo.test.ts`, `ux-canvas-alignment.test.ts`,
  `ux-canvas-library.test.ts`, `ux-canvas-controller.test.ts`
- `apps/v2/app/tests/e2e/canvas-manipulation.spec.ts`

Modified:
- `apps/v2/app/src/routes/scene/[id]/+page.svelte` (integrates the command bar / outline-as-layers)
- `apps/v2/app/src/lib/gui/a11y/SceneOutline.svelte` (additive opt-in layers/selection/reorder props)
- `apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte`, `canvas/types.ts` (marquee surface hooks)
- `apps/v2/app/tests/e2e/player-view-projection.spec.ts` (checkbox selector scoping only)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CANVAS-widget-manipulation-and-outline.yaml`

## Known gaps / deferred

- **Delete-undo:** widget destroy is dispatched without an undo entry, because re-creating a widget with
  the same identity is not expressible through the current processing-core command set. A core
  restore-with-identity command is the prerequisite and is out of this UX epic's scope.
- Final render engine remains DEFERRED per architecture-decisions §4 (DOM/CSS baseline behind the
  `ViewportController` abstraction); this epic adds no GPU backend.
- Smart-guide geometry (`alignment.ts` `SnapGuide`) is unit-tested; the live guide-line overlay during a
  freehand pointer drag is a visual polish item layered on the same math.

## Git evidence

- Branch: `ux/UX-CANVAS-widget-manipulation-and-outline` (off chain tip
  `ux/UX-CANVAS-viewport-rendering-and-performance` @ `3b0aab7`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file + regenerated UX
  state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/src/lib/gui/a11y/SceneOutline.svelte
 M apps/v2/app/src/lib/gui/canvas/CanvasViewport.svelte
 M apps/v2/app/src/lib/gui/canvas/types.ts
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/tests/e2e/player-view-projection.spec.ts
 M docs/planning/v2/ux/epics/UX-CANVAS-widget-manipulation-and-outline.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/ux-canvas/
?? apps/v2/app/tests/e2e/canvas-manipulation.spec.ts
?? apps/v2/app/tests/unit/ux-canvas-alignment.test.ts
?? apps/v2/app/tests/unit/ux-canvas-controller.test.ts
?? apps/v2/app/tests/unit/ux-canvas-library.test.ts
?? apps/v2/app/tests/unit/ux-canvas-selection.test.ts
?? apps/v2/app/tests/unit/ux-canvas-transform.test.ts
?? apps/v2/app/tests/unit/ux-canvas-undo.test.ts
?? apps/v2/app/tests/unit/ux-canvas-zorder.test.ts
?? docs/planning/v2/ux/epics/UX-CANVAS-widget-manipulation-and-outline.completion.md
```
