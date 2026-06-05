# MAP-layers-and-visibility — Completion Evidence

Epic: `MAP-layers-and-visibility` — MAP: Layers and visibility
Requirement IDs: **MAP-005, MAP-006, MAP-007, MAP-016**
Architecture contracts: Contract 3 (Role, Visibility & Permission Grant Model), Contract 4 (Scene and Widget Contract)
Stories: MAP-005-S01, MAP-006-S02, MAP-007-S03, MAP-016-S04 (each T01 design, T02 implementation, T03 test, T04 demo)

## Summary

The DM can now author named, ordered map layers and control their visibility. Each layer carries
type (category), three INDEPENDENT presentation axes (player-visibility, DM-display, opacity), tags,
and structured query metadata. The DM can create, rename, reorder, duplicate, lock, and delete
layers; locked layers reject mutation fail-closed. A layer's player-visibility toggles independently
from its DM-display and opacity, and toggling one layer never affects another. Layers can be queried
by type/metadata, with the result visibility-filtered and fail-closed so a hidden layer is OMITTED
(never redacted-in-place) from a non-DM context. Before projecting a map, the DM can validate
map-layer visibility consistency across map/layer/POI/route/fog/token/nested-map data; the audit
blocks projection on leaking/misleading inconsistencies and warns on safely-omitted hidden content,
without leaking hidden values.

All durable layer mutations are pure Processing-Core commands appended through the existing storage
adapter + command lifecycle; no GUI component reaches storage. Player-visibility changes compose with
the PERM visibility engine and invalidate affected participant visibility caches (PERM-012). The
layer query and projection audit speak the same visibility vocabulary as the active-map projection
(`getActiveMapViewForActor`) and the PERM visibility-filter precedence model.

## Demo

Path (no auth/setup; uses the local demo vault; default actor is the DM):

1. `pnpm v2:dev` (or `pnpm v2:build && pnpm --filter @dndtools/v2-app preview`).
2. Open `/atlas/?map=map-western-reaches`. The map viewport renders the POI control AND a new
   **Layers** panel (`data-testid="map-layer-panel"`) listing the three seeded layers: Terrain and
   Roads (player-visible) and Hidden Camps (dm-only).
3. **MAP-005 authoring**: type a name into **New layer name** and press **Add layer** — a new
   `dm-only` layer appears and survives a page reload (durable). Use **Move up/Move down** to
   reorder, **Duplicate** to clone a layer (`(copy)` suffix), **Lock**/**Unlock** to toggle the
   lock, and **Delete** to remove a layer.
4. **MAP-005 lock fail-closed**: press **Lock** on Terrain — its visibility/opacity/delete controls
   become disabled and the layer shows a `locked` badge. Pressing **Unlock** re-enables them.
5. **MAP-006 independence**: change Terrain's player-visibility select to `dm-only` — its opacity
   slider and **DM shown** checkbox are unchanged, and Roads is untouched. Drag Terrain's opacity to
   `0` — its visibility stays `player-visible`.
6. **MAP-006 / MAP-007 no leak**: switch the header **View as** control to **Demo Player** (then
   **Demo Observer**). The Layers panel now shows ONLY the player-visible layers; the `dm-only`
   Hidden Camps layer is absent (omitted, not redacted), and the authoring controls disappear. Set
   Hidden Camps back to `player-visible` as the DM, then view as a player — it now appears.
7. **MAP-016 pre-projection check**: as the DM, the panel shows a **Pre-projection check** notice
   (`Safe to project` for the demo data, since it has no leaking references). The audit is DM-only —
   a player/observer never receives it.

Requirement IDs exercised by the demo: **MAP-005, MAP-006, MAP-007, MAP-016**.

## Traceability (requirement → code + tests)

| Requirement                                                                                                                        | Code                                                                                                                                                                                                                                                                                                                                        | Tests                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAP-005 (create/rename/reorder/duplicate/lock/delete; type/opacity/visibility/tags/query; locked rejects fail-closed)              | `apps/v2/packages/core/src/state/map-layers.ts` (pure reducers), `apps/v2/packages/core/src/commands/map-layer.ts` (durable commands), `apps/v2/packages/core/src/state/map-state.ts` (extended `MapLayer` + `normalizeMapLayer`), `apps/v2/packages/core/src/schemas/commands.ts` (layer command schemas), `dispatch.ts`/`types.ts` wiring | `apps/v2/packages/core/tests/map-layer-reducers.test.ts`, `apps/v2/packages/core/tests/map-layer-commands.test.ts`                                                                                                                            |
| MAP-006 (player-visibility independent of DM-display + opacity; one layer toggle does not affect others)                           | `setLayerPlayerVisibility` / `setLayerDmEnabled` / `setLayerOpacity` in `state/map-layers.ts`; `handleSetMapLayer*` in `commands/map-layer.ts`; visibility-cache bridge `mapLayerVisibilityMetadata`/`mapLayerVisibilitySurfaces` in `queries/map-layer-query.ts`                                                                           | `apps/v2/packages/core/tests/map-layer-reducers.test.ts` (independence + no-cross-touch + no-op-no-revision), `apps/v2/packages/core/tests/map-layer-commands.test.ts` (PERM-012 cache invalidation), e2e `map-layers-and-visibility.spec.ts` |
| MAP-007 (tag/query by type/metadata without reading hidden layer data into player contexts)                                        | `queryMapLayers` in `apps/v2/packages/core/src/queries/map-layer-query.ts`                                                                                                                                                                                                                                                                  | `apps/v2/packages/core/tests/map-layer-query.test.ts` (DM full result + hidden count; player/observer OMIT hidden; dm-only-map fail-closed; shared delivery; unknown actor; cross-map)                                                        |
| MAP-016 (validate map-layer visibility consistency across map/layer/POI/route/fog/token/nested-map before projecting; non-leaking) | `apps/v2/packages/core/src/permissions/map-projection-consistency.ts` (`auditMapProjectionConsistency`, `getMapProjectionConsistencyForActor`)                                                                                                                                                                                              | `apps/v2/packages/core/tests/map-projection-consistency.test.ts` (AC1 route→hidden POI BLOCK; AC2 misleading token BLOCK; AC3 DM-only safe-omit WARN; nested-map link BLOCK; clean map; DM-only gating)                                       |
| GUI surface (DM layer-management UI; actor-filtered, fail-closed)                                                                  | `apps/v2/app/src/lib/gui/MapLayerPanel.svelte`, wired in `apps/v2/app/src/routes/atlas/+page.svelte`                                                                                                                                                                                                                                        | e2e `apps/v2/app/tests/e2e/map-layers-and-visibility.spec.ts`                                                                                                                                                                                 |
| Public core surface                                                                                                                | `apps/v2/packages/core/src/index.ts` (MAP-005/006/007/016 export blocks)                                                                                                                                                                                                                                                                    | existing `apps/v2/packages/core/tests/boundary.test.ts` / `apps/v2/packages/core/tests/type-runtime-split.test.ts` (still green)                                                                                                              |

AC mapping highlights:

- **MAP-005-S01 AC** (reorder C above A persists render order; locked layer rejects edit):
  reducer `reorderLayer` + `requireUnlocked`; unit "moving C above A reorders and re-packs" +
  "a locked layer rejects rename/reorder/delete/visibility/opacity/tags"; command "reorders a layer
  and persists the new order"; e2e "reordering moves a layer and persists the order" + "locking a
  layer disables its edit controls".
- **MAP-006-S02 AC** (player query includes a newly player-visible layer and leaves others unchanged;
  a `dm-only` layer is absent from a player's projected view): reducer independence tests; query
  tests; e2e "a DM-only layer never appears in the player/observer view" + "toggling one layer
  player-visibility does not affect other layers" (both projects).
- **MAP-007-S03 AC** (DM tag filter returns matches; player's same query OMITS hidden matches rather
  than redacting): query tests "the DM filtering by a tag gets every matching layer" + "a player
  running the same query gets hidden matches OMITTED, not redacted" (hard leak assertions on the
  serialized result).
- **MAP-016-S04 AC** (visible route→hidden POI blocks; hidden token on visible overlay blocks when
  omission misleads; hidden token safely omitted from DM-only overlay is non-blocking warning):
  `map-projection-consistency.test.ts` AC1/AC2/AC3.

## Tests run

- `pnpm --filter @dndtools/v2-core test` — **616 passed** (52 files). Adds 4 new files / 42 new
  cases: `map-layer-reducers.test.ts`, `map-layer-commands.test.ts`, `map-layer-query.test.ts`,
  `map-projection-consistency.test.ts`. Base was 574.
- `pnpm --filter @dndtools/v2-app test` — **55 passed** (12 files), unchanged (no app unit
  regressions from the model/GUI change).
- `pnpm --filter @dndtools/v2-app exec playwright test` (FULL suite, BOTH projects:
  `desktop-chromium` AND `mobile-chromium`) — **170 passed, 18 skipped, 0 failed**. The 18 skips are
  the pre-existing intentional project-scoped skips (dense-grid Scene specs on mobile). Base was 154
  passed; this epic adds 16 e2e tests (8 cases × 2 projects), all in
  `map-layers-and-visibility.spec.ts`.
- `pnpm v2:typecheck` — 0 errors (core `tsc --noEmit` + app `svelte-check`, 603 files).
- `pnpm v2:lint` (Processing-Core boundary lint) — passed; the new core modules import no
  Svelte/DOM/platform/v1 code, and the GUI reaches durable state only through `runtime.dispatch`.
- `pnpm v2:gates` — passed (7 gates owned/budgeted/wired).
- `pnpm v2:workpack:validate` — passed (before `complete`, and again after).

## Quality review

- **Correctness**: All four requirements' acceptance criteria implemented and covered by unit + e2e.
  Edge cases: dense `order` re-packing on insert/reorder/delete, no-op visibility/opacity changes do
  not bump revision or re-stamp, duplicate inserts an unlocked copy after a (even locked) source,
  last-layer delete refused, out-of-range order/opacity refused, unknown actor/map fail-closed.
- **Architecture integrity**: Layer policy is pure `@dndtools/v2-core` (reducers + query + audit,
  Contracts 1/3). Durable mutations enter exclusively through `map.*-layer` commands appended to the
  operation log via `appendOperationDraft` (Contract 1 binding rules; Contract 4 state ownership —
  "Map layer opacity/visibility → Map entity"). The GUI dispatches command intents and renders the
  actor-filtered query; it never writes durable state. No v1 runtime imports; boundary lint green;
  ADR-014 honored.
- **Tests**: Unit coverage spans pure reducers, durable command dispatch (DM gating, op log, lock
  fail-closed end-to-end), the visibility-filtered query (including hard leak assertions), and the
  pre-projection audit. E2e proves the three required visible behaviors on BOTH profiles.
- **Accessibility**: Every layer control has a label (visually-hidden where compact); the lock button
  exposes `aria-pressed`; the consistency notice uses `role="alert"` when blocking. Controls are
  reachable by keyboard and touch (no hover requirement). The panel renders identically across
  profiles, so no profile-specific a11y fork.
- **Performance**: Reducers are O(n) over a single map's layers and allocation-light; the query is a
  linear scan per scoped map. No new listeners or timers.
- **Security / permissions / visibility**: This is the security-sensitive core of the epic.
  Player-visibility is filtered through the same precedence model as the active-map projection and
  the PERM visibility-filter; a `dm-only` (or undelivered `shared`) layer is OMITTED from a non-DM
  result and from the GUI panel, with hard leak assertions (serialized result + page body never
  contain the hidden layer's name/id). Layer mutations are DM-only and fail closed for
  player/observer. The MAP-016 audit and report are DM-gated (`getMapProjectionConsistencyForActor`
  returns `null` for non-DM) and non-leaking (entity references + generic remediation only).
- **Persistence**: Each layer mutation bumps the parent map revision and appends a conflict-shaped
  durable operation (`map.layer.<mutation>`, with before/after revision), persisted through the
  existing Dexie storage adapter (`persistMapState`). The e2e "creating a layer … persists across
  reload" proves the durable round-trip.
- **Sync/offline**: Operations carry actor/entity/revision metadata (conflict-shaped, replayable);
  map layers map to the contract's "Operation-based merge by layer/POI/route/fog operation id". Fully
  offline — no network dependency. Player-visibility changes invalidate affected participant
  visibility caches synchronously via the existing PERM-012 engine (`invalidateVisibilityCache`),
  proven in `map-layer-commands.test.ts`.
- **UX**: Empty state ("No layers are visible to you."), disabled controls on locked layers and at
  list bounds (Move up/down, last-layer delete), and a DM-only hidden-from-players count. The panel
  adapts to both profiles without a functional fork (slim-device contract).
- **Maintainability**: Small typed modules with cohesive responsibilities (pure reducers vs durable
  commands vs query vs audit). No speculative abstraction; no unrelated refactors. The `MapLayer`
  extension is backward-compatible via `normalizeMapLayer` (legacy/partial layers read with safe
  defaults).
- **Docs**: This completion file; thorough module/component doc comments tying behavior to
  MAP-005/006/007/016 and Contracts 1/3/4.

## Known gaps / deferred

- POI/route/fog/token/nested-map records are modeled as DECLARATIVE INPUTS to the MAP-016 audit
  rather than as durable state in this slice — the durable POI/route/fog/token/nested-map authoring
  models are owned by separate MAP epics. The audit composes unchanged when those records become
  durable: the same `MapProjectionInput` shape is fed from the future authoring state. The demo
  data therefore has an empty (clean) projection report; the audit logic is fully unit-tested against
  synthetic graphs covering every blocking/warning case.
- The cache-invalidation bridge feeds the existing PERM-012 visibility cache (the engine whose
  trigger list names "visibility"). Opacity/order/DM-display are presentation axes, not visibility,
  so they intentionally do not invalidate the VISIBILITY cache; the rendered map view-model reflects
  them on the next query (no stale-cache risk), which the tests assert explicitly.
- No stop condition was hit.

## Status commands

- `pnpm v2:workpack:set-status -- --epic MAP-layers-and-visibility --status active` (at implementation start).
- `pnpm v2:workpack:complete -- --epic MAP-layers-and-visibility` (at completion).
- Workpack status: `complete`.

## Git evidence

- Branch: `epic/MAP-layers-and-visibility` (created from `epic/MAP-interaction-safety` HEAD `cf3ac07`).
- Commit: the single epic commit on this branch (SHA recorded at handoff).
- Final `git status --short` after committing: clean (no untracked or unstaged files).
