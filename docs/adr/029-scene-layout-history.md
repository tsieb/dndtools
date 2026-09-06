# ADR-029: Scene Layout History

- Status: Accepted
- Date: 2026-09-04
- Deciders: Engineering
- Consulted: Product, Design, QA
- Supersedes: N/A
- Amends: ADR-014 (Scene canvas layout was silent on undo/redo and on destructive-op recovery; this
  ADR fills both gaps without changing ADR-014's processing/display boundary.)

## Context

The scene canvas (`apps/gm-react/src/screens/scenes` composing `widget.add` / `widget.move` /
`widget.resize` / `widget.layer` / `widget.dock` / `widget.pin` / `widget.group-widgets` /
`widget.move-group` / `widget.set-focus-order` / `widget.configure` / `widget.destroy-widget` —
`packages/core/src/commands/widget.ts`) has no undo stack and no way to recover a destroyed widget.
A DM who drags a widget off-canvas, fat-fingers a resize, or clicks "remove" on the wrong card has
no path back except manually rebuilding it. `RC_ROADMAP.md` §1.1 already names this as a real gap
("scene canvas has no undo/restore").

`packages/core` solved the same problem for the map editor in ADR-024 §4: pure inverse builders
(`buildMapInverse`) that the app keeps as a local, non-durable, app-side stack, dispatched back
through the normal command path. That decision's reasoning — a co-DM must never undo another
person's in-progress edit from across the table, and undo state must never enter the durable op log
— applies to the scene canvas identically. Layout edits (move/resize/layer/dock/pin/group/focus)
should reuse that exact model.

Widget **destruction** is different in kind from a layout tweak. `widget.destroy-widget`
(`handleDestroyWidget`, `packages/core/src/commands/widget.ts:581`) drops the `WidgetInstance` and
its bindings entirely — there is nothing left in `stateBefore` for a later session, or a different
device that wasn't open when it happened, to reconstruct from. A local undo stack does not help here
because it lives only in the tab that issued the destroy and is gone on refresh; a DM who closes the
confirm toast, or a co-DM syncing in five minutes later, has no recovery path at all. This needs a
durable, synced answer, not a local one — but a durable answer that keeps every destroyed widget
forever would grow the `scenes` slice without bound and contradicts the product's "destroy means
destroy" intent for anything the DM doesn't undo promptly.

## Decision

Two mechanisms, matched to the two failure modes above.

### 1. Local, non-durable undo/redo for layout edits (mirrors ADR-024 §4)

`packages/core` exports a pure `buildWidgetInverse(command, stateBefore): UndoableWidgetCommand |
null` in a new `packages/core/src/lifecycle/widget-undo.ts`, following the exact shape of
`buildMapInverse` (`packages/core/src/lifecycle/map-undo.ts:132`): given an ACCEPTED command and the
scene state it was dispatched against, it returns `{ command, label }` for the command that exactly
undoes it, or `null` when the command is not undoable (an id-less create, or a command whose forward
effect cannot be inverted without ambiguity).

Covered commands: `widget.move`, `widget.resize`, `widget.layer`, `widget.dock`, `widget.pin`,
`widget.set-focus-order`, `widget.configure`, `widget.group-widgets`, `widget.move-group`. Each
inverse reads the widget's/group's prior layout fields out of `stateBefore` the same way
`buildMapInverse` reads prior layer/POI/token fields, and returns the same command type with those
prior values as payload (a `widget.move` inverts to a `widget.move` with the old `{x,y}`; a
`widget.resize` inverts to a `widget.resize` with the old `{w,h}`; and so on). `widget.add` is
**excluded** from this inverse builder — its undo is `scene.restore-widget` in reverse, i.e.
requesting the same destroy the mechanism below already provides for a widget the DM decides to
delete a moment after adding it, so the app's undo stack routes an `add` undo to the destroy command
directly rather than duplicating a second removal path.

The app (`apps/gm-react/src/screens/scenes`) keeps the undo/redo stack in a `useState`/`useRef` hook
scoped to the canvas component, one stack per open scene tab, cleared on navigation away. Undo
dispatches the inverse command through the normal `SceneRuntime.dispatch` path — it is an ordinary,
authorized, durably-logged mutation, never a back-door state write — and pushes the original command
onto the redo stack. The stack is never persisted (not to IndexedDB, not to the op log, not to
cloud sync): a co-DM must never see "undo" reach across the table and revert your last drag, and a
tab refresh legitimately clears it, matching every desktop editor's convention and ADR-024's
established precedent. Keyboard: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` (and `Ctrl+Y` on Windows)
redo, both routed through the same dispatch as the toolbar buttons per guardrail 8 (WCAG 2.2 AA —
identical command, keyboard-reachable).

### 2. Durable, TTL'd tombstone for destroy (new: `scene.restore-widget`)

`widget.destroy-widget` changes from a hard delete to a **soft delete**: the handler moves the
`WidgetInstance` and its section membership into a new `scene.tombstones: WidgetTombstone[]` array
on the `Scene` record instead of dropping it, stamping `destroyedAt` and `expiresAt = destroyedAt +
7 days`. It is removed from `scene.widgets` and every `section.widgetInstanceIds` (so it renders and
queries exactly as before — nothing reads live widgets differently) but its full state, including
bindings, survives in the tombstone. The op log gets one new `opType`: `scene.destroy-widget` keeps
recording the destroy as it does today (`packages/core/src/commands/widget.ts:625`); nothing about
the forward-op shape changes, so replay and sync are unaffected.

A new command, `scene.restore-widget { sceneId, widgetInstanceId }`, re-inserts the tombstoned
widget back into `scene.widgets` and its original section(s) verbatim (same id, same layout, same
bindings) and removes the tombstone entry. It durably logs as `scene.restore-widget` and is
available to any actor with scene co-edit authority, exactly like destroy — restore is not
history-scoped to the actor who destroyed it, because the whole point is that it survives past the
destroying tab's local undo stack.

**TTL, not forever.** A background sweep — `pruneExpiredTombstones`, called from the same lifecycle
tick that already runs other durable maintenance (`packages/core/src/lifecycle/command-lifecycle.ts`)
— drops tombstones whose `expiresAt` has passed. Seven days is chosen to comfortably outlive a
single session's "wait, bring that back" moment and a DM's next session prep, without turning
`scenes` into an unbounded audit log; it is a plain constant (`WIDGET_TOMBSTONE_TTL_DAYS = 7`) in
`packages/core/src/state/scene-state.ts`, not user-configurable in this slice. The DM sees
tombstoned widgets in a "Recently removed" list scoped to the scene (Scene inspector, not a new
screen), each entry showing the widget's label and a relative "removed Nd ago" / "expires in Nd" —
copy per guardrail 7, no engine jargon — with a **Restore** action per guardrail 8's keyboard
parity.

### Schema

`Scene.schemaVersion` bumps from its current value to the next integer for the additive
`tombstones: WidgetTombstone[]` field (defaults to `[]` on migration — existing scenes gain no
tombstones, byte-identical otherwise) per guardrail 4 / `DATA_MODEL.md` §6. This is an additive
field, not a reshape: the migration is a single default-fill, covered the same way ADR-024's
additive `MapFeature.props` field was, except ADR-024 could stay at v1 because it added an optional
field to an _existing_ array element; here a brand-new top-level array requires the version bump so
older builds don't silently drop tombstones they don't know how to read.

## Consequences

### Positive

- Closes the roadmap's named gap: the scene canvas gets real undo/redo and a real "I didn't mean
  that" path for destroy, matching the map editor's already-shipped bar.
- Reuses ADR-024's proven shape end to end (pure inverse builder, app-side stack, never durable,
  never synced) — no new undo _architecture_, only a new inverse table for widget commands.
- Destroy recovery is durable and synced (a co-DM or a second device can restore it too), which a
  local undo stack could never provide, while the 7-day TTL keeps the durable slice bounded.
- No behavior change for any code that only reads `scene.widgets` / `scene.sections` — a tombstoned
  widget is invisible to every existing query, actor-scoped or not, without touching those queries.

### Negative

- A second removal-adjacent concept (local undo vs. durable tombstone) for engineers to keep
  straight; mitigated by explicitly excluding `widget.add`/`destroy` from the local inverse table
  above so there is exactly one path for each.
- `Scene` records carry tombstone weight for up to 7 days after every destroy — bounded, but not
  free; a DM who destroys dozens of widgets in one cleanup pass grows the record until the sweep
  runs.
- The sweep is lifecycle-tick-driven, not a hard deadline: a scene that stays untouched past
  `expiresAt` keeps its tombstones until the next mutation touches it. Acceptable — it never
  affects correctness, only how promptly storage is reclaimed.

## Rejected Alternatives

| Alternative                                                                  | Why Rejected                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route destroy through the same local, non-durable undo stack as layout edits | Loses the moment the tab closes or a second device is involved; the roadmap gap is explicitly about a destroy the DM can't get back, which a local-only stack cannot fix.                                       |
| Durable undo/redo for layout edits too (sync the whole stack)                | Rejected for the identical reason ADR-024 §4 rejected it: a synced stack lets a co-DM "undo" someone else's in-progress drag, and pollutes the op log with reverted busywork instead of durable campaign state. |
| Keep destroy permanent, add a confirm dialog only                            | Confirm dialogs are already standard UI hygiene and don't replace recovery from a genuine mis-click; doesn't close the named gap.                                                                               |
| Tombstone with no TTL (keep forever, manual purge)                           | Turns `scenes` into an unbounded audit log the product never asked for and nobody prunes in practice; a bounded TTL gets the same recoverability with predictable storage.                                      |

## Migration Impact

- `Scene.schemaVersion` bump (see Schema above) with a migration test asserting: (a) a v(n-1) scene
  loads with `tombstones: []`, (b) every other field is byte-identical, (c) round-trip
  export/import preserves it.
- New command family: `scene.restore-widget` (handler + zod input schema in
  `packages/core/src/schemas/commands.ts`, appended per guardrail 10) and a new `WidgetTombstone`
  type in `packages/core/src/state/scene-state.ts`.
- `handleDestroyWidget` changes from delete to tombstone-and-hide; existing tests asserting the
  widget is gone from `scene.widgets`/sections still pass unchanged (that part of the contract is
  unchanged) and gain a new assertion that it is present in `scene.tombstones`.
- New pure module `packages/core/src/lifecycle/widget-undo.ts` (`buildWidgetInverse`), unit-tested
  per covered command the same way `map-undo.test.ts` covers `buildMapInverse`.
- App-side: scene canvas gains an undo/redo stack hook and keyboard bindings, and the Scene
  inspector gains a "Recently removed" list with a Restore action. Both are additive UI; no existing
  screen contract changes.
- `pruneExpiredTombstones` wired into the existing lifecycle maintenance tick
  (`packages/core/src/lifecycle/command-lifecycle.ts`); unit-tested with a fake clock.

## Rollback Plan

- Trigger: the tombstone mechanism proves to desync devices (a restore racing a concurrent destroy)
  or the TTL sweep misbehaves in a way that leaks widgets past their DM-visible expiry.
- Technical rollback: revert `handleDestroyWidget` to the prior hard-delete behavior and stop
  emitting `scene.restore-widget`; the schema field stays (additive fields are safe to leave unread)
  but is no longer written. `buildWidgetInverse`/local undo for layout edits is independent and
  needs no rollback — it never touches durable state.
- Data recovery: any tombstone already written before rollback remains inert in the slice; no data
  loss beyond "restore is no longer offered" for widgets destroyed after rollback.
- Known rollback risk: a scene mid-TTL at rollback time keeps its existing tombstones until the next
  edit touches it (same as the normal sweep timing) — cosmetic only, no correctness impact.

## Amendment — RC-CAN-1.2 as built (2026-09-05)

The tombstone half of §2 shipped with three deliberate departures from the decision above. The
decision itself — destroy is a durable soft delete, `scene.restore-widget` puts the same instance
back, retention is bounded — is unchanged.

1. **Retention is 30 days, not 7.** `WIDGET_TOMBSTONE_RETENTION_DAYS = 30` in
   `packages/core/src/state/scene-state.ts`, matching the plan of record
   (`docs/planning/RC_ROADMAP.md`, RC-CAN-1.2) rather than this ADR's earlier 7. A scene's bin is
   small (one record per destroyed widget) and a month comfortably covers "we cleaned up before the
   break and want that back"; the storage argument for 7 days was never load-bearing.
2. **No `Scene.schemaVersion` bump.** `tombstones` is an OPTIONAL field, so a scene persisted before
   it existed hydrates as a scene with an empty bin with no migration at all, and a scene whose bin
   is empty drops the field entirely (`withTombstones`). That is guardrail 3's "prefer additive
   fields" taken to its conclusion: there is no shape a reader can encounter that it cannot read, so
   there is nothing for a version bump to protect. Older builds ignore the field rather than
   silently dropping it, because nothing in the persistence path filters unknown keys.
3. **Expiry is evaluated on read and pruned on the next tombstone mutation**, not swept from a
   lifecycle tick. An expired tombstone is never restorable (`isRestorableTombstone` gates the
   restore handler), and the destroy/restore handlers drop expired records as they pass. This keeps
   the core free of a background clock, so replaying the same op log against the same environment
   produces byte-identical state — the §2 "sweep timing is cosmetic" note, made structural.

Also as built: a tombstone stores the widget's `index` in `Scene.widgets` alongside its section, so
destroy → restore of a middle widget is byte-identical rather than moving it to the end; and a widget
whose package was removed or disabled while it sat in the bin comes back as the same disabled
placeholder those commands leave on live instances, so the undo always succeeds without pretending
the widget works. `buildWidgetInverse` now inverts `scene.destroy-widget` to `scene.restore-widget`
(it was refused in RC-CAN-1.1 pending this command), and `UNDOABLE_COMMAND_TYPES` maps the pair.

## Amendment — RC-CAN-1.3 as built (2026-09-05)

The app half of §1 shipped, with three departures from the decision above.

1. **The hook is `apps/gm-react/src/app/canvas/useLayoutHistory.ts`, not a hook under
   `screens/scenes`.** Two screens own a canvas — `screens/Board.tsx` (`/board`, bounded policy) and
   `screens/sceneEditor/index.tsx` (`/scene/:id`, free canvas) — and they share one engine,
   `app/SceneBoardCanvas.tsx`. A stack living in either screen would have had to be reinvented in the
   other. Depth is 50 (`MAX_LAYOUT_HISTORY`), per the plan of record; the ADR named no depth.
2. **The hook takes the runtime as an argument instead of reading `useRuntime()`.** That is what lets
   the stack be exercised against a plain Core state holder in `useLayoutHistory.test.tsx` — which is
   the only place a `scene.resize-widget` undo can be tested at all, because every widget that ships
   today is `system` tier and the canvas gives system widgets no resize handle and swallows their
   `Shift+Arrow`. The end-to-end acceptance in `canvas.spec.ts` therefore covers undo of a move and
   of a destroy on both profiles, and the resize case is covered as a unit.
3. **Undo of `scene.add-widget` is not wired.** §1 says the app routes an add-undo to
   `scene.destroy-widget` using the id off the `scene.widget-added` event. The screens' guarded
   `dispatch` returns only whether the command was accepted, so the minted id is not in reach without
   widening that seam; `buildWidgetInverse` honestly returns `null`, and the hook records nothing
   rather than pushing a step that would do the wrong thing. Adding a widget therefore leaves the
   stack alone. HANDOFF: routing it needs `dispatch` to surface the accepted result's events.

Also as built: removing a widget no longer stages a confirm dialog on either screen. The dialog
existed because a destroy could not be taken back; RC-CAN-1.2 made it reversible, so the removal
happens at once and offers "Undo" in a toast that never auto-dismisses (`Toast.jsx` pins any toast
carrying an action, WCAG 2.2.1), backed by the same `scene.restore-widget` the stack dispatches for
`Ctrl+Z`. The canvas hosts a permanent `role="status"` region that announces "Undone: moved Timer" /
"Redone: moved Timer"; it is re-keyed on a sequence number so repeating an identical reversal is
announced every time rather than being swallowed as an unchanged string.
