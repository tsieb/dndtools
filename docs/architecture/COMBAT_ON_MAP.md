# Combat on the Map

As-built reference for combat tokens, AoE templates, and movement on the map. Decision record:
[ADR-030](../adr/030-combat-on-the-map.md); two departures from its text are marked below.

## 1. Token placement is session state

Combat tokens live in `SessionCombatState.tokens: Record<string, CombatToken>`, keyed by
`combatantId`, not on the map (`packages/core/src/state/combat-tracker.ts`). A `CombatToken` carries
the `mapId` it is on, a normalized position, a footprint in grid cells, its own `SceneVisibility`,
and an optional `controllerActorId` for player-moved tokens. The field is additive; a combat
persisted before tokens existed hydrates to `{}`. So a token survives a map switch, and an NPC or
monster combatant with no character gets one without a synthetic actor.

Commands (`packages/core/src/commands/combat.ts`, DM-only): `combat.place-token`,
`combat.move-token`, `combat.remove-token`; `autoPlaceCombatTokens` seeds a grid when combat starts
with a map linked.

**Known gap.** `MapState.tokens: MapToken[]` (`map-annotations.ts`, `map-state.ts`) has not been
removed; the ADR's `MAP_STATE_SCHEMA_VERSION` bump that folds it into session state is still open.
Do not add a writer to the old array.

## 2. Reading tokens

There is no standalone `tokensOnMapForActor`; `getMapViewForActor(..., { combat })`
(`queries/map-query.ts`) joins `session.combat.tokens` for the requested map into
`MapView.combatTokens`, actor-scoped like every other field, and only while
`combat.status === 'running'`. A surface opts into the overlay by asking for `{ combat }`; the map
tile switches it off by not asking. `combat-tracker-view.ts` resolves one combatant's token for the
tracker.

On the editor, `useCombatTokens` (`app/map/canvas/useCombatTokens.ts`) joins that view with
`getCombatTrackerForActor` (HP, conditions, defeated) on `combatantId`; a withheld combatant is
simply absent, so a hidden foe cannot be drawn. `CombatTokenLayer.tsx` renders initials avatars, an
`HPBar`, package-resolved condition badges, and an active-turn ring; dragging or arrow keys
dispatch `combat.move-token` snapped to the grid through `editor.run(..., { undoable: false })`,
because moving a creature is session state, never a map edit. Selection is one ephemeral
`selectedCombatantId` in `app/session/SessionSelection.tsx`, shared between the token layer and the
inspector's roster, never dispatched or synced. `CombatOverlay.tsx` draws the read-only overlay on
the session stage preview and the scene map tile.

## 3. AoE templates are durable (departure from the ADR)

The ADR chose ephemeral, peer-broadcast templates. As shipped, `CombatTemplate[]` is a durable
`SessionCombatState.templates` field: a template belongs to the fight, and `combat.end` clears the
list, so no template outlives its encounter. A template extends the geometry kit's `AreaTemplate`
(origin, rotation, size in table units) plus `id`, `mapId`, `label`, an optional
`sourceCombatantId`, and DM provenance; at most 32 live templates of at most 1000 ft. Covered cells
are derived from the live grid on every read, never stored. Commands: `combat.place-template`,
`combat.remove-template`, DM-only.

The editor's Combat tool group (`app/map/tools.ts`): Move, Sphere, Cone, Line, Cube, Measure. Size
and heading are armed in `ToolOptionsBar.tsx`. `useCombatTemplates` returns affected combatants per
template and nothing at all without DM authority. `CombatToolLayer.tsx` paints reachable cells, the
path preview, and covered cells, and pointer and keyboard dispatch the identical command. Templates
are not yet drawn on the read-only surfaces: `MapView` carries no `combatTemplates` field.

## 4. Movement derives from the package and the scale

`getCombatantMovementForActor` (`queries/map-movement.ts`, over `computeMovementRange`,
`resolveMovementSpeed`, `movementCostTo`, `movementPathTo`) derives reach from the active System
Package's per-mode speeds and the map's `MapScale`; nothing is stored. A map with no scale falls
back to advisory, unscaled distance rather than a fabricated foot count.

## 5. Fog is unchanged

Vision during a turn writes `MapState.fog` through the existing append-only `MapFogOp` log exactly
as outside combat; a reveal caused by a token move is indistinguishable from a manual reveal.

## 6. Where to look

| Concern                                 | Location                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens, templates, `SessionCombatState` | `packages/core/src/state/combat-tracker.ts`                                                                                            |
| Commands                                | `packages/core/src/commands/combat.ts`                                                                                                 |
| Map-scoped reads                        | `packages/core/src/queries/map-query.ts`, `combat-tracker-view.ts`                                                                     |
| Movement                                | `packages/core/src/queries/map-movement.ts`                                                                                            |
| Editor layers and hooks                 | `apps/gm-react/src/app/map/canvas/{CombatTokenLayer,CombatToolLayer,CombatOverlay}.tsx`, `useCombatTokens.ts`, `useCombatTemplates.ts` |
| E2E                                     | `map-editor.spec.ts`, `combat.spec.ts`, `map-tile.spec.ts`                                                                             |
