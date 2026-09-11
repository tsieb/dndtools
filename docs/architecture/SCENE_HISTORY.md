# Scene History

Undo/redo for layout edits and reversible widget destruction on the scene canvas and the GM Screen.
Decision record: [ADR-029](../adr/029-scene-layout-history.md), amended for both halves as built.

## 1. Two mechanisms

Undo state must never enter the durable op log: a co-DM must not see your in-progress drag reverted
from across the table. So layout undo is local and non-durable, while destroy recovery, which has to
survive a refresh and reach other devices, is durable but bounded.

## 2. Local undo/redo for layout edits

`buildWidgetInverse(command, stateBefore)` (`packages/core/src/lifecycle/widget-undo.ts`) mirrors
the map editor's `buildMapInverse`: given an accepted command and the prior scene state it returns
the exact inverse, or `null` when inversion is ambiguous. Covered: `widget.move`, `resize`, `layer`,
`dock`, `pin`, `set-focus-order`, `configure`, `group-widgets`, `move-group`, and
`scene.destroy-widget` (inverts to `scene.restore-widget`). Not covered: `scene.add-widget` (the
minted id is not in `stateBefore`, and the screens' guarded `dispatch` does not surface it, so
adding a widget leaves the stack untouched) and `scene.group-widgets` (a fresh group id with no
ungroup command).

The app hook `apps/gm-react/src/app/canvas/useLayoutHistory.ts` keeps a 50-deep stack per canvas
instance, takes the runtime as an argument (which is what lets the resize undo be unit-tested, since
system widgets have no resize handle), and is never persisted. Undo dispatches the inverse through
the normal `SceneRuntime.dispatch`. Keyboard: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y`. Both
`screens/Board.tsx` and `screens/sceneEditor/index.tsx` share the hook through
`app/SceneBoardCanvas.tsx`.

`scene.duplicate-widget` (RC-CAN-2.4) copies a widget through the core and emits
`scene.widget-added`. Without a caller-supplied identity its minted ID is absent from
`stateBefore`, so the inverse builder cannot identify the new instance.

## 3. Durable tombstones for destroy

`widget.destroy-widget` is a soft delete: the instance, its section membership, and its array
index move into `Scene.tombstones?: WidgetTombstone[]` (`scene-state.ts`) stamped `destroyedAt`.
It disappears from `scene.widgets` and every section, so all existing queries read exactly as
before. `scene.restore-widget { sceneId, widgetInstanceId }` (`commands/widget.ts`) re-inserts it
verbatim at the same index and is available to any actor with scene co-edit authority.

The field is optional, so there is no schema bump: a scene persisted before it hydrates with an
empty bin. Retention is `WIDGET_TOMBSTONE_RETENTION_DAYS = 30`; expiry is checked on read
(`isRestorableTombstone`) and expired records are pruned on the next tombstone mutation, never by a
background clock, so replaying an op log stays byte-identical. A widget whose package was removed
while it sat in the bin comes back as the same disabled placeholder a live instance shows.

Removing a widget no longer stages a confirm dialog; it happens at once and offers Undo in a toast
that never auto-dismisses (`Toast.jsx` pins any toast with an action). The canvas hosts a
`role="status"` region announcing "Undone: moved Timer", re-keyed per reversal.

## 4. Where to look

| Concern                           | Location                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Widget inverse builder            | `packages/core/src/lifecycle/widget-undo.ts`                                        |
| Map inverse builder (precedent)   | `packages/core/src/lifecycle/map-undo.ts`                                           |
| Tombstone type, retention, reader | `packages/core/src/state/scene-state.ts`                                            |
| `scene.restore-widget`            | `packages/core/src/commands/widget.ts`                                              |
| `scene.duplicate-widget` | `handleDuplicateWidget` in `packages/core/src/commands/widget.ts` |
| Undo/redo hook                    | `apps/gm-react/src/app/canvas/useLayoutHistory.ts`                                  |
| E2E                               | `apps/gm-react/tests/e2e/canvas.spec.ts` (undo a move and a destroy, both profiles) |
