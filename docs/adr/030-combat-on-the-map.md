# ADR-030: Combat on the Map

- Status: Accepted
- Date: 2026-09-04
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amends: ADR-024 (§2 additive `MapFeature` model); pointer note on ADR-014

## Context

MAP-019 shipped combat tokens as a `MapToken[]` array living directly on `MapState`
(`packages/core/src/state/map-annotations.ts:185`, `packages/core/src/state/map-state.ts:256`),
keyed by `linkedActorId` and edited through map-scoped annotation commands. Session combat already
has its own durable slice — `SessionCombatState` in `packages/core/src/state/combat-tracker.ts`,
mounted at `session.combat` (`packages/core/src/state/session-state.ts:392`) — with initiative
order, rounds, turns, and a `combatantId` identity for every participant. The two models do not
share a key: a map token is addressed by actor, a combatant by combatant id, and an NPC/monster
combatant that never had a character sheet has no `linkedActorId` to hang a token off at all.

This mismatch bites the moment combat needs a battle map: switching maps mid-encounter (a token
array tied to one `MapState`), multiple combatants sharing a character (hirelings, summons), and
NPC-only combatants (no `linkedActorId`) are all unrepresentable or ambiguous in the current shape.
Area-of-effect templates (cones, bursts, lines) have no home at all yet, and nothing in the map
domain owns movement/range math — SYS's forthcoming System Package (ADR-028) is the only place that
will know a creature's speed, and MAP owns the scale that converts it to normalized-map units. This
ADR settles where combat-positional state lives before SYS or WID build against it.

## Decision

### 1. Combat tokens move to `session.combat.tokens`, keyed by combatant id, not the map

Token placement becomes durable session-combat state, not a map feature. A `CombatToken` carries
`combatantId` (the `SessionCombatState` combatant it represents — required, not optional: a token
with no combatant is a plain map marker/POI, already served by `MapPoi`), the `mapId` it is
currently placed on, a normalized position, footprint size in grid cells, its own player-facing
`SceneVisibility`, and an optional `controllerActorId` for player-moved tokens (MAP-019 AC3/AC4
carry over unchanged). Placement, movement, and removal become `combat.token.*` commands owned by
the SES combat command file (`packages/core/src/commands/combat.ts`), replacing the map-annotation
token commands. `MapToken` and the `tokens` field are removed from `MapState`/`map-annotations.ts`
in the same change that adds `CombatToken`; this is a slice move, not a duplication.

This makes a token survive a map switch by construction (the record's `mapId` moves with it, the
list is not re-keyed per map), and gives an NPC/monster combatant a token without inventing a
synthetic actor id. Reads are still map-scoped where the GUI needs them: a
`tokensOnMapForActor(sessionCombat, mapId, actor)` query filters `session.combat.tokens` by
`mapId` and applies the same `SceneVisibility` actor-scoping every other query uses (guardrail 3),
so the map screen keeps rendering "tokens on the map I'm looking at" without the map owning them.

### 2. AoE templates are ephemeral session state, not persisted

A spell template (cone/burst/line/etc.) is a targeting aid the DM or a player is actively placing,
not a fact about the world worth persisting or syncing to a rejoining device. It lives in
non-durable, non-replicated in-memory app state on the client placing it (mirroring the local,
non-durable undo/redo stack ADR-024 §4 established for scene layout), broadcast peer-to-peer for
live collaborators the same way cursor/selection presence already is, and discarded on confirm
(which may translate into a durable effect — e.g. an AoE-tagged fog reveal or a damage-application
command — through its own command) or cancel. No schema, no `schemaVersion`, no op-log entry for
the template itself.

### 3. Movement and range derive from the System Package's speed model and the map scale

A combatant's speed (walking/flying/swimming/etc., however many the active `SystemPackage`
declares — ADR-028 §"dice model, action economy") combined with the current map's `MapScale`
(`packages/core/src/state/map-state.ts:215`) is the only source of "how far can this token move" or
"is this token in range." This is a pure derivation — `queries/combatMovementForActor` or similar —
not stored state: it is recomputed from the active System Package + map scale + token positions on
every read, so it never goes stale when either changes. A map with no `scale` set falls back to an
ungridded "distance is advisory" mode (fail closed and honest, guardrail 9): the UI shows raw
normalized distance, not a fabricated foot/meter count. This query is written against the
`SystemPackage` shape ADR-028 defines; until SYS lands the `systems` slice, the query accepts a
narrower `{ speeds: Record<string, number> }` shape so combat movement is not blocked on SYS's
timeline, and SYS's landing is a signature-compatible narrowing, not a rewrite.

### 4. Fog reveal during combat is unchanged — still the durable MAP-012 log

Vision/darkvision resolving during a combatant's turn (a token moving into a lit area, a lantern
catching a previously fogged cell) writes to `MapState.fog` via the existing `MapFogOp` append-only
log (`packages/core/src/state/map-state.ts:246`) exactly as it does outside combat. Combat does not
get a parallel fog mechanism: a token's owning `mapId` is what a fog-reveal command run "because of
combat" targets, and it is indistinguishable in the log from a DM manually revealing the same cell.
This keeps MAP-012 the single source of truth for what has ever been revealed, combat or not.

## Consequences

### Positive

- One combatant identity (`combatantId`) threads through initiative, resources, and now position —
  no actor-id workaround for NPCs/monsters, no re-derivation when a token's map changes.
- AoE templates get an explicit ephemeral-state home instead of being invented ad hoc per feature
  as WID/CAN stories touch them.
- Movement/range math has exactly one owner (the derivation in §3) instead of being duplicated
  per screen, and it is forward-compatible with SYS landing the full `SystemPackage` shape.
- Fog stays single-sourced; no combat-only fog path to keep in sync with MAP-012.

### Negative

- `MapToken` is a breaking removal from `MapState`, not an additive change — any in-flight WID/CAN
  story reading `map.tokens` directly must be repointed to the new query before it lands.
- The map-scale fallback ("distance is advisory") is a real UX regression versus a map that always
  has a scale; DM education (a scale-setting nudge) is deferred to the MAP lane, not solved here.
- The System Package narrowed-shape query (§3) is a temporary contract this ADR itself introduces
  and SYS must retire — a second migration point if the narrowing and ADR-028's real shape drift.

## Rejected Alternatives

| Alternative                                                                    | Why Rejected                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep tokens on `MapState`, add a `combatantId` field alongside `linkedActorId` | Does not fix the map-switch problem (a token array is still per-map); grows two parallel identity fields on the same record instead of picking one authority.             |
| Persist AoE templates as durable `MapFeature`s                                 | A targeting preview is not a fact about the world; persisting it pollutes MAP-012-adjacent history with transient DM fiddling and needs its own cleanup/expiry mechanism. |
| Store computed movement/range on the token record                              | Turns a pure derivation into cached state that must be invalidated on every speed/scale/position change — a staleness bug generator for no persisted benefit.             |
| Give combat its own fog-reveal log separate from MAP-012                       | Duplicates MAP-012's append-only history and reopens the "what has ever been revealed" question per-source instead of once.                                               |

## Migration Impact

- Code/data contracts affected: `MapState.tokens` / `MapToken` removed from
  `packages/core/src/state/map-annotations.ts` and `map-state.ts`; `CombatToken` added to
  `combat-tracker.ts`, mounted at `SessionCombatState.tokens` (additive field on an already-durable
  slice — no `schemaVersion` bump on `session-state.ts` needed for the addition itself, but the
  **removal** of `MapState.tokens` is a `MAP_STATE_SCHEMA_VERSION` bump with a migration that folds
  any persisted `map.tokens` into `session.combat.tokens` keyed by best-effort `combatantId` lookup
  (via `linkedActorId` → combatant match), dropping unmatched tokens with a logged warning.
- Rollout sequencing: land the `CombatToken` shape + `combat.token.*` commands + migration first
  (SES lane), then repoint the map-screen token rendering to the new
  `tokensOnMapForActor` query (CAN/MAP lane), then delete the old `MapToken` path.
- Validation and test changes: a migration test asserting pre-ADR fixture maps with tokens hydrate
  into `session.combat.tokens` with no data loss for matched tokens; `combat.token.*` command tests
  covering placement/move/remove/visibility exactly mirroring the MAP-019 AC1–AC4 coverage the old
  map-annotation tests had.
- Backward compatibility: a cloud-backup restore of a pre-ADR vault runs the migration on load: this
  is a genuine schema bump, not a byte-identical-round-trip case like ADR-024's additive features.

## Rollback Plan

- Trigger conditions: the migration loses tokens at a rate inconsistent with "unmatched dropped and
  logged" (i.e. a bug, not the expected best-effort gap), or the movement/range query proves
  unusable ahead of SYS landing the real `SystemPackage` shape.
- Technical rollback steps: revert the `combat.token.*` command + `CombatToken` commit and the
  `MapState.tokens` removal commit together (they must land/roll back as one unit — the migration
  is one-way); restores `MapToken` and the old map-annotation token commands.
- Data recovery considerations: the schema-bump migration is one-way by design (matches
  DATA_MODEL.md §6); rollback after real usage on the new shape means hand-writing a down-migration
  from `session.combat.tokens` back to per-map `MapToken[]`, not simply reverting code.
- Known rollback risks: any AoE-template or movement-query consumers added after this ADR lands
  would need to be reverted in the same window; rolling back code without rolling back a vault that
  already migrated leaves that vault's tokens invisible to the old code path.

## Verification and Evidence

- Key file paths (once implemented): `packages/core/src/state/combat-tracker.ts` (`CombatToken`,
  `SessionCombatState.tokens`), `packages/core/src/commands/combat.ts` (`combat.token.*`),
  `packages/core/src/queries/` (`tokensOnMapForActor`, `combatMovementForActor`),
  `packages/core/src/state/map-state.ts` / `map-annotations.ts` (token removal + migration).
- Tests: migration round-trip test for pre-ADR fixture maps; `combat.token.*` command tests mirror
  MAP-019 AC1–AC4; movement-query tests for the narrowed-shape fallback and the "no scale set"
  advisory-distance path.
- Operational runbooks or docs: `docs/architecture/DATA_MODEL.md` §6 migration entry;
  `docs/adr/README.md` index row cross-linking ADR-024 (amended) and ADR-028 (narrowed-shape
  dependency).
