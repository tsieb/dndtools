# Combat on the Map

> **Status:** As-built reference for the RC-MAP-1.x / RC-SES combat-positional slice.
> **Decision record:** `docs/adr/030-combat-on-the-map.md` (ADR-030). This doc tracks the
> shipped code, including two departures from the ADR text noted inline below.
> **Audience:** Engineers touching combat, the map/scene canvas, or the System Package's
> speed model.

## 1. The problem this closes

Before this slice, combat tokens (`MapToken[]`) lived directly on `MapState`, keyed by
`linkedActorId`. That could not represent an NPC/monster combatant with no character sheet,
lost a token's position on a map switch (the array was per-map), and gave two combatants
sharing one character no way to have separate tokens. Session combat already had its own
identity — `Combatant`/`combatantId` in `SessionCombatState` — that the map model ignored.

## 2. Where token placement actually lives

Combat token placement is **durable session-combat state**, not a map feature:
`SessionCombatState.tokens: Record<string, CombatToken>`, keyed by `combatantId`
(`packages/core/src/state/combat-tracker.ts:230,422`). A `CombatToken` carries the
`combatantId`, the `mapId` it is currently on, a normalized position, a footprint size in
grid cells, its own `SceneVisibility`, and an optional `controllerActorId` for
player-moved tokens. This field is additive (RC-MAP-1.1): a combat persisted before tokens
existed hydrates to `{}`, no `schemaVersion` bump.

Commands (`packages/core/src/commands/combat.ts`), all DM-only, dispatched as
`combat.place-token` / `combat.move-token` / `combat.remove-token`
(`packages/core/src/commands/types.ts:230-232`; handlers `handlePlaceCombatToken`,
`handleMoveCombatToken` at `commands/combat.ts:1309,1398`). Auto-placement
(`autoPlaceCombatTokens`, `combat-tracker.ts:297`) seeds a token grid when combat starts
with a map already linked.

**Known gap, honestly stated:** `MapState.tokens: MapToken[]` (the old MAP-019 array,
`packages/core/src/state/map-annotations.ts:185`, `map-state.ts:256`) has **not** been
removed. ADR-030's Migration Impact calls for a follow-on `MAP_STATE_SCHEMA_VERSION` bump
that deletes it once map-screen rendering repoints to the new read path (§3); as of this
writing both arrays exist side by side and nothing has migrated `MapState.tokens` data into
`session.combat.tokens`. Do not add a third writer to either array — extend the new one.

## 3. Reading tokens for a map

There is no standalone `tokensOnMapForActor` export (the name ADR-030 proposed). The actual
read path is `getMapViewForActor` (`packages/core/src/queries/map-query.ts:290`), which joins
`session.combat.tokens` filtered to the requested `mapId` via the internal
`liveCombatTokenEntries(combat, mapId)` (`map-query.ts:269`) into `MapCombatTokenView[]`
(`map-query.ts:115,175`) on the returned map view — actor-scoped like every other field on
that view (guardrail 2/3). Combat tokens are only joined in while `combat.status ===
'running'`. A second, narrower join exists for the combat tracker's own read side:
`combat-tracker-view.ts:236` resolves one combatant's token by id for the tracker UI.

## 3.1 The token layer UI (RC-MAP-2.1)

The map editor draws the running fight. `useCombatTokens`
(`apps/gm-react/src/app/map/canvas/useCombatTokens.ts`) is the app's single read: it calls
`getMapViewForActor(..., { combat })` for the tokens on the edited map and
`getCombatTrackerForActor` for what that view deliberately does not carry (hit points,
conditions, defeated/bloodied), and joins the two on `combatantId`. Visibility is never
re-decided app-side — a combatant the core withholds is simply absent from `combatTokens`, so
a hidden foe cannot be drawn.

`CombatTokenLayer.tsx` renders each token as an initials `Avatar`, a DS `HPBar`, condition
mini-badges resolved through the active system package (`ConditionBadge` →
`useConditionDef`), and an active-turn ring. There is no portrait yet: the core carries no
portrait or image field on characters or combatants, so `Avatar`'s `src` seam is the join
point once one exists. Dragging dispatches `combat.move-token` snapped to
`MapOverlaySettings.gridSize`, offered only where `MapCombatTokenView.canMove` is true; the
arrow keys on a focused token are the keyboard equivalent and dispatch the identical command
one cell at a time. A move runs through `editor.run(..., { undoable: false })` — moving a
creature mid-fight is session state, not a map edit, and must never land on the editor's local
map undo stack.

Selection is shared, not per-surface: `app/session/SessionSelection.tsx` holds one ephemeral
`selectedCombatantId` outside React (read through `useSyncExternalStore`, with an app-wide
default store so no provider has to be threaded through the root). Clicking a token selects
the combatant in the editor's initiative list (`InspectorPanel.tsx`'s `CombatRosterSection`)
and clicking a row rings the token. Nothing about it is dispatched, persisted, or synced — a
co-DM's highlight must not move anyone else's cursor.

RC-MAP-2.3 landed the read-only overlay (`canvas/CombatOverlay.tsx`) on the other surfaces
that draw a map: it is `MapCanvas`'s own layer, fed by `MapView.combatTokens`, so a surface
opts in simply by asking `getMapViewForActor` for `{ combat }`. The session stage preview
(`screens/session/ActiveMap.tsx`) and, since RC-CAN-4.5, the scene canvas's map tile
(`app/widgets/builtin/Map.tsx`) both do. The tile switches the overlay off by asking WITHOUT
`{ combat }` rather than by not drawing what it was given.

Still UI-pending: the AoE templates of §4 are drawn on no surface at all, because
`getMapViewForActor` does not carry them — an actor-scoped read (`MapView.combatTemplates`,
`queries/map-query.ts`) has to land before any surface can draw one without deciding
visibility for itself. The session tracker widget
(`app/widgets/builtin/InitiativeTracker.tsx`) does not yet join the shared selection.

## 4. AoE templates — durable, not ephemeral (a real departure from ADR-030 §2)

ADR-030 decided area-of-effect templates would be **ephemeral, client-local, peer-broadcast**
state, never persisted. RC-MAP-1.2 shipped them differently: `CombatTemplate[]` is a durable
field on `SessionCombatState.templates` (`combat-tracker.ts:322-427`), additive like tokens (a
pre-existing combat hydrates to `[]`). The reasoning recorded in code
(`combat-tracker.ts:322-330`): a template belongs to the fight it was cast in, not to one
tab's session — `combat.end` clears the whole list (durable-but-scoped, not durable-forever),
so no template outlives the encounter it describes, closing the "mystery circle on next
week's map" concern from a different angle than the ADR's local-only design.

A `CombatTemplate` (`combat-tracker.ts:337`) extends the geometry-kit `AreaTemplate` — a
normalized origin, a rotation in degrees, and a size in **table units (feet)**, so a 20-ft
radius stays 20 ft at any zoom — plus `id`, `mapId`, `label`, an optional
`sourceCombatantId`, and DM provenance (`placedBy`/`placedAt`). Bounds: at most
`MAX_COMBAT_TEMPLATES` (32) live templates, each no larger than `MAX_TEMPLATE_SIZE_UNITS`
(1000 ft) — `combat-tracker.ts:349,352`. Which grid cells a template covers is never stored;
`templateCells` (map-movement/geometry layer) derives it from the map's live grid on every
read, so a later grid change never leaves a template holding stale cells.

Commands: `combat.place-template` / `combat.remove-template`
(`commands/types.ts:237-238`; handler `handlePlaceCombatTemplate`, `commands/combat.ts:1583`),
DM-only both ways (`commands/combat.ts:1560`). `templatesOnMap(state, mapId)`
(`combat-tracker.ts:381`) is the pure per-map read. (`PrepRecap.tsx`'s hit for "template" is an
unrelated encounter-prep template, not this type.)

### 4.1 The placement UI (RC-MAP-2.2)

The map editor's tool rail carries a **Combat** group (`app/map/tools.ts`): Move, four area tools —
Sphere, Cone, Line, Cube — and Measure, which moved here out of Annotate because a distance is
something a DM reads mid-fight. `AOE_TOOL_KIND` is the only place tool ids and `TemplateKind` meet.
Size and heading are armed in the options bar (`ToolOptionsBar.tsx`, `ToolOptions.templateSize` /
`templateRotation`), and "Clear all areas" takes them back off, so placing one is never a one-way
door.

`useCombatTemplates` (`app/map/canvas/useCombatTemplates.ts`) joins `templatesOnMap` against the
already actor-filtered combat tokens from `useCombatTokens` using the core's own
`templateCoversPoint`, and returns the affected combatants per template. It returns **nothing at all**
without DM authority: a template is DM-authored tactical scaffolding, so a viewer who may not have
it gets an empty list rather than a filtered one. The status bar (`StatusBar.tsx`) reports the
newest template's shape, cell count and the combatants inside it — the question the DM asked when
they placed it.

`CombatToolLayer` (`app/map/canvas/CombatToolLayer.tsx`) paints the reachable cells, the path
preview and the covered cells, and owns one focusable surface where **pointer and keyboard dispatch
the identical command**: click a cell, or arrow-key a pending cell and press Enter (Escape drops
it). Neither `combat.move-token` nor `combat.place-template` goes on the editor's map undo stack —
they are session acts, and Ctrl+Z on a map edit must not rewind a fight.

## 5. Movement and range derive from the System Package + map scale

Per ADR-030 §3, "how far can this token move" is never stored — it is a pure derivation from
the active System Package's per-mode speeds (walking/flying/swimming/…, whatever the package
declares) and the map's own `MapScale`. The shipped query is
`getCombatantMovementForActor` (`packages/core/src/queries/map-movement.ts:654`), built on
`computeMovementRange` / `resolveMovementSpeed` / `movementCostTo` / `isCellReachable` /
`movementPathTo` in the same file. `resolveMovementSpeed` (`map-movement.ts:589`) takes the
narrowed `{ speeds: Record<string, number> }` shape ADR-028/ADR-030 anticipated rather than
the full `SystemPackage`, so this query does not block on the System Package landing its
complete speed model and narrows compatibly when it does. A map with no `scale` set falls
back to an advisory, unscaled distance rather than fabricating a foot/meter count
(guardrail 9, fail closed and honest).

## 6. Fog is unchanged

Vision/darkvision resolution during a combatant's turn still writes to `MapState.fog`
through the existing append-only `MapFogOp` log (`map-state.ts:246`), exactly as outside
combat. There is no combat-specific fog path; a reveal triggered by a token's move is
indistinguishable in the log from a DM manual reveal (ADR-030 §4, unchanged as built).

## 7. Where to look in code

| Concern                                          | Location                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `CombatToken`, `SessionCombatState.tokens`       | `packages/core/src/state/combat-tracker.ts:230,422`                                                                     |
| `CombatTemplate`, `SessionCombatState.templates` | `packages/core/src/state/combat-tracker.ts:322-427`                                                                     |
| Token/template commands                          | `packages/core/src/commands/combat.ts` (`handlePlaceCombatToken`, `handleMoveCombatToken`, `handlePlaceCombatTemplate`) |
| Command type union                               | `packages/core/src/commands/types.ts:230-238`                                                                           |
| Map-scoped combat-token read                     | `packages/core/src/queries/map-query.ts:115,175,224,269,290`                                                            |
| Tracker-scoped single-token read                 | `packages/core/src/queries/combat-tracker-view.ts:236`                                                                  |
| Movement/range derivation                        | `packages/core/src/queries/map-movement.ts:589,654`                                                                     |
| Combat tool group + AoE tool ids                 | `apps/gm-react/src/app/map/tools.ts`                                                                                    |
| Template coverage + affected combatants          | `apps/gm-react/src/app/map/canvas/useCombatTemplates.ts`                                                                |
| Range/path/AoE canvas layer                      | `apps/gm-react/src/app/map/canvas/CombatToolLayer.tsx`                                                                  |
| Old (not yet removed) per-map token array        | `packages/core/src/state/map-annotations.ts:185`, `map-state.ts:256`                                                    |
| Decision record                                  | `docs/adr/030-combat-on-the-map.md`                                                                                     |
