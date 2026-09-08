# Scene History (Undo/Redo and Destroy Recovery)

> **Status:** As-built reference for RC-CAN-1.1/1.2/1.3, closing the roadmap's "scene canvas
> has no undo/restore" gap.
> **Decision record:** `docs/adr/029-scene-layout-history.md` (ADR-029, amended 2026-09-05
> for both halves as built). This doc restates the amended, shipped design.
> **Audience:** Engineers touching the scene canvas, the map editor's undo, or any new
> mutating widget-layout command.

## 1. Two mechanisms for two different failure modes

The map editor already had pure inverse builders for undo (ADR-024 §4:
`buildMapInverse`, `packages/core/src/lifecycle/map-undo.ts:132`). This work extends that
exact model to the scene canvas layout, and adds a second, unrelated mechanism for widget
destruction — because a layout tweak (move/resize/reorder) and a destroy are different in
kind. A layout tweak's prior value survives in `stateBefore`; a destroy drops the record
entirely, so there is nothing left in `stateBefore` for a rejoining device or a later session
to reconstruct from.

**Rule stated once, applied twice:** undo state must never enter the durable op log — a
co-DM must never see your in-progress drag reverted from across the table. So layout undo is
local and non-durable; destroy recovery, which does need to survive a refresh and reach other
devices, is durable but bounded (a tombstone, not forever).

## 2. Local, non-durable undo/redo for layout edits

`buildWidgetInverse(command, stateBefore): UndoableWidgetCommand | null`
(`packages/core/src/lifecycle/widget-undo.ts:97`) mirrors `buildMapInverse`'s shape exactly:
given an ACCEPTED command and the scene state it was dispatched against, it returns the
command that exactly undoes it, or `null` when it cannot be inverted without ambiguity.

Covered: `widget.move`, `widget.resize`, `widget.layer`, `widget.dock`, `widget.pin`,
`widget.set-focus-order`, `widget.configure`, `widget.group-widgets`, `widget.move-group`, and
(since RC-CAN-1.2 landed `scene.restore-widget`, §3) `scene.destroy-widget` inverts to
`scene.restore-widget`. Reported honestly as `null` rather than a wrong guess:

- **`scene.add-widget`** — the instance id is minted by the handler, so it is not present in
  `stateBefore` to invert from. The app hook does not route an add-undo at all (see the
  "as built" departure below) — this is a real, open gap, not silently patched.
- **`scene.group-widgets`** — the handler mints a fresh `groupId` and there is no ungroup
  command; guessing would corrupt an existing group.

**App-side hook:** `apps/gm-react/src/app/canvas/useLayoutHistory.ts` (not under
`screens/scenes` as the ADR's decision text assumed — see §4), depth
`MAX_LAYOUT_HISTORY = 50`. The stack lives in the hook's own state, scoped per canvas
instance, never persisted (not IndexedDB, not the op log, not cloud sync) — a tab refresh
legitimately clears it. Undo dispatches the inverse command through the normal
`SceneRuntime.dispatch` path (an ordinary, authorized, durably-logged mutation, never a
back-door write) and pushes the original command onto the redo stack. Keyboard:
`Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` redo, routed through the same dispatch as any
toolbar button (guardrail 8 — identical command, keyboard-reachable).

## 3. Durable, TTL'd tombstone for destroy

`widget.destroy-widget` is a **soft delete**: the handler moves the `WidgetInstance` and its
section membership into `Scene.tombstones?: WidgetTombstone[]`
(`packages/core/src/state/scene-state.ts:135`) instead of dropping it, stamping
`destroyedAt`. It is removed from `scene.widgets`/`section.widgetInstanceIds` — so every
existing query, actor-scoped or not, renders and reads exactly as before — but its full state,
including bindings, survives in the tombstone.

`scene.restore-widget { sceneId, widgetInstanceId }`
(`commands/types.ts:894`, handler in `packages/core/src/commands/widget.ts:894`) re-inserts
the tombstoned widget back into `scene.widgets` and its original section(s) verbatim (same id,
layout, bindings, and — as built — the same array `index`, so restoring a middle widget does
not move it to the end). It is available to any actor with scene co-edit authority, not
scoped to whoever destroyed it, because the whole point is surviving past the destroying tab's
local undo stack.

**Field is optional, no schema bump.** `tombstones?: WidgetTombstone[]` is OPTIONAL, not a
`SCENE_STATE_SCHEMA_VERSION` bump: a scene persisted before the field existed hydrates with an
empty bin (`sceneTombstones`, `scene-state.ts:145`) rather than needing a migration — the
guardrail-3 "prefer additive" principle taken to its conclusion, since there is no shape a
reader can encounter it cannot read.

**Retention is 30 days, not the ADR's original 7** — `WIDGET_TOMBSTONE_RETENTION_DAYS = 30`
(`scene-state.ts:87`), matching the plan of record rather than the ADR's earlier draft figure.
**Expiry is checked on read and pruned on the next tombstone mutation, not swept from a
background clock** — `isRestorableTombstone` (`scene-state.ts:153`) gates the restore handler;
the destroy/restore handlers drop expired records as they pass. This keeps the core free of a
background timer, so replaying the same op log against the same environment stays
byte-identical.

A widget whose package was removed or disabled while it sat in the bin comes back as the same
disabled placeholder a live instance shows — restore always succeeds without pretending a
broken widget works.

## 4. App-side departures from the ADR's decision text (as built, RC-CAN-1.3)

1. **The hook lives at `apps/gm-react/src/app/canvas/useLayoutHistory.ts`**, not under
   `screens/scenes`. Two screens own a canvas — `screens/Board.tsx` (`/board`, bounded policy)
   and `screens/sceneEditor/index.tsx` (`/scene/:id`, free canvas) — sharing one engine,
   `app/SceneBoardCanvas.tsx`. A stack living in either screen would have been reinvented in
   the other.
2. **The hook takes the runtime as an argument** instead of reading `useRuntime()`, which is
   what makes `useLayoutHistory.test.tsx` able to exercise a `scene.resize-widget` undo at all
   — every shipped widget is `system` tier and the canvas gives system widgets no resize
   handle, so the resize-undo path is unit-tested rather than covered end-to-end.
3. **`scene.add-widget` undo is not wired.** The screens' guarded `dispatch` returns only
   whether a command was accepted, not the minted id off the resulting event, so the hook
   cannot route an add-undo to `scene.destroy-widget` as the ADR's decision intended. Adding a
   widget leaves the stack untouched — a genuine open gap, tracked as a HANDOFF in the ADR
   text (widening `dispatch`'s return to surface accepted events), not fixed by this doc.

Also as built: destroying a widget no longer stages a confirm dialog — the destroy is
reversible now, so it happens at once and offers "Undo" in a toast that never
auto-dismisses (`Toast.jsx` pins any toast carrying an action, per WCAG 2.2.1), backed by the
same `scene.restore-widget` the keyboard shortcut dispatches. The canvas hosts a permanent
`role="status"` region announcing "Undone: moved Timer" / "Redone: moved Timer", re-keyed on a
sequence number so an identical repeated reversal is announced every time rather than
swallowed as an unchanged string (WCAG 4.1.3).

## 5. Where to look in code

| Concern                                                   | Location                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pure widget-layout inverse builder                        | `packages/core/src/lifecycle/widget-undo.ts:97`                                           |
| Pure map-editor inverse builder (precedent)               | `packages/core/src/lifecycle/map-undo.ts:132`                                             |
| Tombstone type, retention constant, hydration-safe reader | `packages/core/src/state/scene-state.ts:87,95,135,145,153`                                |
| `scene.restore-widget` command                            | `packages/core/src/commands/widget.ts:894`, type at `commands/types.ts:894`               |
| App undo/redo stack hook                                  | `apps/gm-react/src/app/canvas/useLayoutHistory.ts`                                        |
| Shared canvas engine (both screens)                       | `apps/gm-react/src/app/SceneBoardCanvas.tsx`                                              |
| E2E coverage                                              | `apps/gm-react/tests/e2e/canvas.spec.ts` (undo of a move and of a destroy, both profiles) |
| Decision record                                           | `docs/adr/029-scene-layout-history.md`                                                    |
