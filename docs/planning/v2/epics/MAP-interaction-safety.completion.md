# MAP-interaction-safety — Completion Evidence

Epic: `MAP-interaction-safety` — MAP: Interaction safety
Requirement IDs: **MAP-015**
Architecture contracts: Contract 1 (Processing / Display Decoupling), Contract 4 (Scene and Widget Contract)
Story: MAP-015-S01 (tasks T01 design, T02 implementation, T03 test, T04 demo)

## Summary

A map user can now interact with POI controls (popovers on the expanded profile, sheets on
the compact profile) without pointer, hover, or focus handlers dismissing the active control
prematurely. The dismissal/engagement POLICY is implemented as a small pure Processing-Core
state machine; the GUI dispatches raw interaction intents into it, renders the result, and
applies the returned focus directive. The control dismisses only on a genuine dismiss intent
(explicit close, Escape, a true outside pointerdown/click, or selecting another POI) and never
on an internal pointermove, hover-out, scroll, child-focus, or transient blur.

## Demo

Path (no auth/setup needed; uses the local demo vault):

1. `pnpm v2:dev` (or `pnpm v2:build && pnpm --filter @dndtools/v2-app preview`).
2. Open `/atlas/?map=map-western-reaches` (the player-visible Western Reaches map). The map
   viewport renders with a **Points of interest** control listing two POIs (North Road, Storm
   Coast).
3. Click/tap a POI trigger (e.g. **Storm Coast**). On desktop a popover opens anchored to the
   trigger; on a touch/compact device the same control opens as a bottom sheet
   (`data-presentation="popover"` vs `"sheet"`). Focus moves into the control.
4. Demonstrate it stays open through internal interaction:
   - Hover from the trigger into the popover, then onto an action button — it stays open.
   - Move the pointer away from the control (hover-out) — it stays open (no hover requirement).
   - Scroll/mouse-wheel over it — it stays open.
   - Tab onto a child action — it stays open.
   - Press **Focus region** (an action inside the control) — the viewport focus updates
     (`Viewport centered on region-coast`) and the control stays open.
5. Demonstrate it closes only on genuine dismiss intent:
   - Press **Close**, or press **Escape**, or click outside the control (on the map heading) —
     the control closes and focus returns to the trigger.
   - Open a different POI while one is open — the first closes and the new one opens (a single
     active control), with focus moving into the new control rather than back to the page.

Requirement IDs exercised by the demo: **MAP-015** (both acceptance criteria — pointer
marker→popover transit keeps the popover open; tapping an action inside the compact sheet
executes the action instead of closing from underlying map handlers).

## Traceability (MAP-015 → code + tests)

| Aspect | Code | Tests |
| --- | --- | --- |
| Dismissal/engagement policy (pure state machine) | `apps/v2/packages/core/src/queries/control-interaction.ts` (`controlInteractionReducer`, `reduceControlInteractions`, `isControlOpen`, `CLOSED_CONTROL_INTERACTION`) | `apps/v2/packages/core/tests/control-interaction.test.ts` (30 cases) |
| Core public surface | `apps/v2/packages/core/src/index.ts` (MAP-015 export block) | core boundary test `boundary.test.ts` (unchanged, still green) |
| GUI control surface (popover/sheet, intent dispatch, focus management) | `apps/v2/app/src/lib/gui/MapPoiControl.svelte` | `apps/v2/app/tests/e2e/map-interaction-safety.spec.ts` |
| Atlas wiring (renders POI control for the resolved actor-visible map) | `apps/v2/app/src/routes/atlas/+page.svelte` | same e2e spec |

AC mapping:

- **AC1** (pointer moves from POI marker into popover ⇒ popover remains open):
  reducer `pointermove`/`pointerleave` branches return `focusDirective: 'none'` and keep the
  phase open; unit test "pointermove into the control keeps it open" + e2e "AC1: moving the
  pointer from the trigger into the control keeps it open".
- **AC2** (tap an action inside a compact long-press sheet ⇒ action executes, not closed by
  underlying map handlers): reducer `pointerdown { inside: true }` keeps the control open;
  unit test "a pointerdown INSIDE the control (tapping an action) does NOT dismiss" + e2e "AC2:
  pressing an action inside the control executes it and keeps the control open" (runs on
  mobile-chromium, where the control is a sheet).

## Tests run

- `pnpm --filter @dndtools/v2-core test` — **574 passed** (48 files), including the 30 new
  `control-interaction.test.ts` cases (positive dismiss + negative must-not-dismiss + closed-state
  inert + burst-survival + switch + focus directives).
- `pnpm --filter @dndtools/v2-app exec playwright test` (FULL suite, BOTH projects:
  `desktop-chromium` AND `mobile-chromium`) — **154 passed, 18 skipped, 0 failed**. The 18 skips
  are the pre-existing intentional project-scoped skips (dense-grid Scene specs on mobile). The
  base was 132 passed; this epic adds 22 new e2e tests (11 cases × 2 projects).
- `pnpm v2:typecheck` — 0 errors.
- `pnpm v2:lint` (Processing-Core boundary lint) — passed; the new core module imports no
  Svelte/DOM/platform/v1 code.
- `pnpm v2:workpack:validate` — passed (before and after `complete`).

## Quality review

- **Correctness**: Both MAP-015 acceptance criteria implemented and covered by unit + e2e tests
  on both profiles. Edge cases covered: idempotent re-open (no focus re-yank), switch between
  POIs (single active control, no intermediate restore), closed-state events inert, transient
  blur does not auto-dismiss.
- **Architecture integrity**: Policy lives in `@dndtools/v2-core` as a pure reducer (Contract 1).
  The GUI dispatches intents and reflects the model; it computes only `inside` (DOM `contains`)
  and applies focus, never the dismissal rules. No durable state is mutated (the viewport focus is
  presentation-only GUI memory). No v1 runtime imports; boundary lint green. ADR-014 honored
  (SvelteKit app + package-local core).
- **Tests**: Unit reducer tests include all required negatives (internal
  pointermove/hover-out/scroll/child-focus/transient-blur do NOT dismiss) and positives
  (Escape/outside-pointer/explicit-close/other-POI DO dismiss). E2e proves the visible behavior
  on desktop (popover) and mobile (sheet).
- **Accessibility**: Focus moves into the control on open and is restored to the trigger on a
  genuine dismiss; Escape closes; focus staying within the control during interaction does not
  dismiss it. Triggers carry `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`; the
  control is `role="dialog"` (and `aria-modal` for the sheet). All actions are reachable by
  pointer, keyboard, and touch with no hover requirement (consistent with the CANVAS-012
  "no hover required" precedent).
- **Performance**: The reducer is O(1) and allocation-light; window listeners (pointerdown
  capture + keydown) are registered only while a control is open and torn down on close, so
  nothing lingers to dismiss a future control or leak handlers.
- **Security / permissions / visibility**: The POI control renders regions only from a map that
  the deep-link resolver already resolved to `restore` for the active actor, so a hidden map's
  POIs are never exposed. No new mutation surface; no permission/visibility policy is duplicated
  in the GUI.
- **Persistence / sync / offline**: No durable state added or changed; no storage, operation-log,
  or sync impact. Fully offline (no network dependency).
- **UX**: Empty state ("No points of interest on this map.") handled; popover/sheet adapt to the
  platform profile (slim-device contract). The control is robust against accidental dismissal,
  which is the entire point of the epic.
- **Maintainability**: One small typed core module (~230 lines incl. docs) plus one focused
  Svelte component. No speculative abstraction; no unrelated refactors.
- **Docs**: This completion file; thorough module/component doc comments tying behavior to
  MAP-015, Contract 1, and the source defects.

## Known gaps / deferred

- POIs are modeled in this prototype as `MapRegion[]` on the map entity (the durable POI/marker
  authoring model — `MAP-010`/`MAP-011` — is owned by separate MAP epics). The interaction-safety
  surface attaches to whatever POI/region list the actor-filtered map exposes, so it composes
  unchanged when richer POI records land.
- The reducer is a single-active-control machine (one control open at a time), which matches the
  POI popover/sheet model. Multiple simultaneously-open controls are out of scope for MAP-015 and
  not required by either acceptance criterion.
- No stop condition was hit.

## Status commands

- `pnpm v2:workpack:set-status -- --epic MAP-interaction-safety --status active` (at implementation start).
- `pnpm v2:workpack:complete -- --epic MAP-interaction-safety` (at completion).
- Workpack status: `complete`.

## Git evidence

- Branch: `epic/MAP-interaction-safety` (created from `epic/PERM-visibility` HEAD `9d390b4`).
- Commit: see the epic commit on this branch (recorded at handoff).
- Final `git status --short` after committing: clean (no untracked or unstaged files).
