# CANVAS-layout-accessibility - Completion Evidence

Epic packet: `docs/planning/v2/epics/CANVAS-layout-accessibility.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CANVAS-012**, **CANVAS-016**.

## Demo Path

1. From repo root, run `pnpm v2:dev` and open `http://localhost:5183/`.
2. Create a Scene from the Scene list, then open `/scene/<id>/`.
3. Add a widget (type `note`, version `1.0.0`). The widget row exposes a labelled
   layout toolbar (`role="toolbar"`) of focusable buttons — **Move left/right/up/down**,
   **Widen/Narrow/Taller/Shorter**, **Bring forward/Send backward**, **Dock
   left/right/top/bottom**, **Pin**, **Focus earlier/later**, and **Remove widget**.
4. Tab to any button and press **Enter** (keyboard only): the widget moves, resizes,
   re-layers, docks, or pins. No drag and no hover are required (CANVAS-012). On a touch
   device the same buttons are visible and tappable without hover.
5. Pin or dock the widget. The toggle now offers the inverse action (**Unpin**,
   **Undock**), and the focus order list reorders so persistent chrome is reached first
   while every widget control stays reachable (CANVAS-016).
6. Add a second widget. The widget grid renders in declared focus-traversal order
   (top-most z-order first), not insertion order. Bring a lower widget forward and watch
   it move earlier in the tab order.
7. Select two widgets with their checkboxes and click **Group selected**: both show
   `• grouped` and remain contiguous in the focus order.

The Playwright e2e spec `apps/v2/app/tests/e2e/scene-accessibility.spec.ts` exercises this
demo path (keyboard-only operation, touch-style tap reachability, declared focus order,
and grouping) in desktop Chromium and mobile Chromium.

## Requirement Traceability

| Requirement | Acceptance criteria | Implementation | Test evidence |
| ----------- | ------------------- | -------------- | ------------- |
| CANVAS-012  | Keyboard-only move/resize through focusable controls; touch commands reachable without hover. | `apps/v2/packages/core/src/queries/layout-commands.ts` enumerates every Must-have layout op (move, resize, layer, dock, pin, group, focus, remove) as pointer-free command descriptors mapped to real Processing Core commands, with `resolveLayoutCommandPayload` computing platform-independent coordinate math. The new `scene.set-focus-order` command (`apps/v2/packages/core/src/commands/widget.ts`, `schemas/commands.ts`, `commands/dispatch.ts`, `commands/types.ts`) makes explicit focus metadata authorable. The Scene editor `apps/v2/app/src/routes/scene/[id]/+page.svelte` renders these as a labelled `role="toolbar"` of focusable buttons plus a checkbox-based grouping flow. | `apps/v2/packages/core/tests/layout-accessibility.test.ts` (command coverage, dispatchable payloads, clamping, state-aware toggles, permission gating, set-focus-order). `apps/v2/app/tests/e2e/scene-accessibility.spec.ts` (keyboard-only operation, hover-free tap reachability, grouping). |
| CANVAS-016  | Traversal follows declared focus order with grouped/layered widgets; pin/dock changes keep every control reachable. | `apps/v2/packages/core/src/queries/focus-order.ts` `computeWidgetFocusOrder` produces a deterministic traversal ordered by explicit focus metadata → pinned → docked → floating, then z-order, with grouped widgets kept contiguous and a widget-id tiebreaker (never array/DOM order). `getSceneForActor` exposes `focusOrder` over the actor-delivered widget set. The Scene editor renders widgets in that order so DOM tab order matches the declared order. | `apps/v2/packages/core/tests/scene-focus-order.test.ts` (z-order, group contiguity, explicit metadata, dock/pin tiers, determinism, reachability after pin/dock, player-view scoping). `apps/v2/app/tests/e2e/scene-accessibility.spec.ts` (focus order follows z-order, not insertion order). |

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** All layout operations remain
  Processing Core commands. The GUI only reads core-owned command descriptors
  (`listWidgetLayoutCommands`) and focus-order view models, then dispatches commands; it
  performs no layout mutation or coordinate math itself. Keyboard nudge/resize math and
  focus-order computation are platform-independent core functions, so the same command
  yields the same result on every profile.
- **Contract 4 (Scene and Widget Contract):** Implements "Canvas layout must support
  keyboard movement/resizing alternatives for any pointer operation", "Widget focus order
  follows scene z-order and explicit grouping metadata, not DOM accident", "Every widget
  command must have a keyboard-accessible and touch-accessible path", and "Widgets expose
  accessible names derived from widget type and bound entity name". Layout stays on the
  Scene; no bound entity is mutated.
- **Contract 3 (Permissions):** `listWidgetLayoutCommands` returns no commands unless the
  actor is the DM or holds a Scene `co-editor` grant; `scene.set-focus-order` is DM-gated
  by the same `requireDm` path as the other layout commands.

## Verification Run

```bash
pnpm --filter @dndtools/v2-core typecheck
pnpm --filter @dndtools/v2-core test          # 106 tests pass (incl. 17 new)
pnpm --filter @dndtools/v2-app typecheck       # svelte-check: 0 errors, 0 warnings
pnpm --filter @dndtools/v2-app test            # 7 tests pass
pnpm exec playwright test                      # 23 passed, 3 pre-existing mobile skips
pnpm v2:lint                                   # boundary lint passed
pnpm v2:typecheck
pnpm v2:test
pnpm v2:workpack:complete -- --epic CANVAS-layout-accessibility
pnpm v2:workpack:validate                      # validation passed
```

Playwright runs `vite build && vite preview` on port 4183. The preview server must be
allowed to bind localhost (the run was performed with sandbox networking enabled), matching
the note recorded for prior CANVAS epics.

## Test Depth Rationale

- **Unit (core):** focus-order determinism/ordering rules and layout command
  descriptors/resolution/permissions/set-focus-order.
- **Integration (core):** `getSceneForActor.focusOrder` over command-built scenes and
  player-view filtering.
- **Accessibility e2e:** keyboard-only operation, hover-free reachability, declared focus
  order, and grouping in desktop + mobile Chromium.
- **Boundary:** `pnpm v2:lint` confirms the new core modules import no GUI/platform/v1
  runtime code, and the GUI imports core only through its public API.

## Known Gaps / Deferred

- A multi-widget keyboard "ungroup" command is not added; the Must-have op set
  (CANVAS-003) lists group but not ungroup, and there is no `scene.ungroup` command in this
  slice. Group movement continues to use the existing `scene.move-group` command.
- The keyboard nudge/resize step is a fixed `DEFAULT_LAYOUT_STEP` (20px). A user-configurable
  step and a fine/coarse modifier are a later UX-polish concern.
- Roving-tabindex / arrow-key roaming inside the per-widget toolbar is not implemented; each
  control is an ordinary focusable button reached by Tab, which satisfies the requirement.
  Richer toolbar keyboard semantics can follow with the design-system toolbar component.
- Focus-order computation operates on the widgets delivered to the actor; cross-section
  ordering for multi-section player views follows section delivery, which is owned by the
  existing player-view/section slice.

## Git Evidence

Branch: `epic/CANVAS-layout-accessibility` (based on the chained v2 epic history, 9 commits
ahead of `master`).

Epic-owned changes:

```text
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/commands/widget.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/scene.ts
 M apps/v2/packages/core/src/schemas/commands.ts
?? apps/v2/app/tests/e2e/scene-accessibility.spec.ts
?? apps/v2/packages/core/src/queries/focus-order.ts
?? apps/v2/packages/core/src/queries/layout-commands.ts
?? apps/v2/packages/core/tests/layout-accessibility.test.ts
?? apps/v2/packages/core/tests/scene-focus-order.test.ts
?? docs/planning/v2/epics/CANVAS-layout-accessibility.completion.md
```

Generated planning files updated by the workpack commands:
`docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`, and regenerated
`docs/planning/v2/epics/*.yaml`.

Final `git status --short` after committing the epic (the only remaining entry is the
pre-existing, unrelated `.claude/settings.json` edit that predates this epic and is left
untouched):

```text
 M .claude/settings.json
```
