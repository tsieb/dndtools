# Completion Evidence: MAP-pois-routes-fog-and-combat-overlays

Epic: **MAP: POIs, routes, fog, and combat overlays**
Requirement IDs: MAP-010, MAP-011, MAP-012, MAP-013, MAP-014, MAP-018, MAP-019
Branch: `epic/MAP-pois-routes-fog-and-combat-overlays` (off the prior MAP-nesting epic HEAD `7522ed9`)

This epic completes the MAP domain. It adds first-class POIs, routes, fog operations, combat tokens,
and explicit combat-overlay modes to the durable map model, and — the keystone — routes EVERY map
surface (render, list, search, graph, deep link) through ONE actor-filtered map query so a hidden
artifact cannot leak through any surface.

## Demo path

1. `pnpm v2:dev`, open `/atlas/`, open **Western Reaches** (`/atlas/?map=map-western-reaches`).
2. The **Map annotations** panel (`data-testid="map-annotations-panel"`) lists POIs, routes (with
   derived distance + travel time), fog, tokens, and the combat-overlay controls — all rendered from
   the single actor-filtered query.
3. As DM you see the player-visible **Harbor Town** POI and the **dm-only Smugglers' Cache** POI.
   Type `cache` in the map search: the hidden POI is a hit for the DM.
4. Use the header **View as** switch → `Demo Player`. The Smugglers' Cache POI vanishes from the list,
   from search (`cache` → "No matching artifacts you can see"), and its name/notes never appear in the
   DOM. Switch to `Demo Observer`: same.
5. Reveal it: as DM set the `Hidden Camps` layer and the POI's own visibility to `player-visible`,
   switch to the player — the POI now appears, no reload (MAP-011 AC2; independent visibility).
6. The **North Road March** route reports `60.0 miles` and `~2.50 days` deterministically (MAP-013).
7. Open **Ruined Keep** (`/atlas/?map=map-ruined-keep`). Under **Combat overlay**, pick `grid-align`
   and **Set mode**: it is BLOCKED with a reason naming `grid-visible` (MAP-014 fail-closed). Check
   **Auto-enable prerequisites** and re-submit: grid turns on and the mode enters.
8. Under **Fog of war**, **Reveal area** / **Reveal (offline)** append durable fog ops (the offline
   one still persists locally — MAP-012 AC2). Under **Tokens**, the DM can **Move** any token; a
   player can move only a token they control (MAP-019 AC4).

## Requirement → implementation → tests traceability

| Req | Implementation | Tests |
| --- | --- | --- |
| MAP-010 (POIs: create/move/categorize/link, normalized coords) | `state/map-annotations.ts` (`createPoi`/`updatePoi`/`deletePoi`, normalized-space guards); `commands/map-annotations.ts` (`handleCreate/Update/DeleteMapPoi`); `MapEntity.pois`; schemas `createMapPoiInputSchema` etc. | `map-annotations.test.ts` (reducers), `map-annotation-commands.test.ts` (durable create/move/link, fail-closed OOB, DM-only) |
| MAP-011 (POI visibility independent; non-leak across list/search/widget) | POI `visibility` field independent of map/layer; `queries/map-query.ts` filters POIs via map→layer→annotation precedence (hidden-ancestor-wins) | `map-query.test.ts` (adversarial non-leak: hidden POI absent from view/search/graph, serialized-payload assertions; reveal makes it appear), `map-annotation-commands.test.ts` (independent reveal), e2e leak assertions |
| MAP-012 (fog reveal/conceal durable + sync, queues offline) | `appendFogOp`/`removeFogOp` (append-only, `sequence`-ordered); `handleAppendMapFog` with `connectionState` → `queued`/`delivered` delivery status + durable op | `map-annotations.test.ts` (append/order), `map-annotation-commands.test.ts` (delivered vs queued-offline persists locally; concealed region absent from player query), e2e fog flow |
| MAP-013 (routes: distance/travel-time, link waypoints) | `state/map-travel.ts` pure `measureRoute`/`measureRange` (deterministic, fail-soft); routes carry waypoints with links; query derives measurement | `map-travel.test.ts` (determinism, scale/speed math, fail-soft), `map-annotation-commands.test.ts` + e2e (60 mi / 2.50 days) |
| MAP-014 (explicit overlay modes w/ declared prerequisite, fail-closed) | `state/map-overlay-modes.ts` (`MODE_PREREQUISITES`, `enterOverlayMode`, `configureOverlay` — gate enforced even on a forced/config path); `handleSetMapOverlayMode`/`handleConfigureMapOverlay` | `map-overlay-modes.test.ts` (block/auto-satisfy/no-bypass), `map-annotation-commands.test.ts` + e2e (grid-align blocked → auto-satisfy enters) |
| MAP-018 (one actor-filtered query for render/search/graph/MCP/deep-link) | `queries/map-query.ts`: `getMapViewForActor` (the single model), `searchMapsForActor`, `mapGraphEdgesForActor`, `deliveredMapIdsForActor` — every other surface consumes THIS, never raw `MapState` | `map-query.test.ts` (search/graph built on the model never return hidden artifacts; hidden/missing map = generic unavailable; unknown actor fail-closed), e2e search non-leak |
| MAP-019 (token lifecycle/move/range/AoE, actor-filtered projection) | `createToken`/`moveToken`/`updateToken`/`deleteToken`; `handleMoveMapToken` authorizes DM-or-controller BEFORE mutation, computes move distance from scale; query projects only permitted tokens with `canMove` | `map-annotations.test.ts` (reducers), `map-query.test.ts` (hidden token omitted from player projection; `canMove`), `map-annotation-commands.test.ts` (move distance from scale; player moves only controlled token; cross-player denial), e2e |

## Tests run

- `pnpm --filter @dndtools/v2-core test` → **62 files, 788 tests passed** (was 723 at base; +65 new).
  New files: `map-travel.test.ts`, `map-overlay-modes.test.ts`, `map-annotations.test.ts`,
  `map-query.test.ts`, `map-annotation-commands.test.ts`.
- `pnpm --filter @dndtools/v2-app test` → **12 files, 55 tests passed**.
- `pnpm --filter @dndtools/v2-app exec playwright test` (BOTH `desktop-chromium` AND `mobile-chromium`)
  → **212 passed, 18 skipped (intentional project-scoped), 0 failed**. New e2e:
  `map-pois-routes-fog-and-combat-overlays.spec.ts` (8 tests × 2 projects) — hard leak assertions
  (dm-only POI / hidden token / hidden POI name never in player DOM or search), deterministic route
  distance/time, fail-closed combat-mode prerequisite, durable+offline fog.
- `pnpm v2:lint` (boundary) → passed (no v1 imports; core never imports GUI/DOM).
- `pnpm v2:typecheck` (core `tsc` + app `svelte-check`) → 0 errors / 0 warnings.
- `pnpm v2:gates` → 7 gates passed. `pnpm v2:workpack:validate` → passed.

## Quality review

- **Correctness**: every mapped acceptance criterion is covered by a unit and/or e2e test. Normalized
  coordinates are validated fail-closed at the schema boundary AND in the reducers; route math is
  pure and deterministic; the overlay prerequisite gate has no bypass path.
- **Architecture**: pure Processing-Core policy (geometry, filtering, distance, mode gating are
  deterministic functions). The GUI dispatches command intents and renders the actor-filtered query
  model only — it never touches storage or raw `MapState`. Per ADR-014 no pixel renderer was built;
  the deliverable is the logical/data model plus a list/inspector GUI surface. Boundary lint stays
  green; no v1 runtime imports.
- **Tests**: per-requirement unit coverage + adversarial non-leak across view/list/search/graph,
  fog durability/queue-shape, deterministic route math, fail-closed mode prerequisites, token-control
  authorization (including cross-player denial).
- **Accessibility**: the annotations panel uses labelled sections, visually-hidden labels on every
  control, `role="status"`/`role="alert"` for fog-saved and overlay-blocked messages; the existing
  axe-backed route a11y suite still passes.
- **Performance**: queries are linear over a map's annotations; no new heavy work on the hot path.
  Quality-gate perf budgets unchanged and green.
- **Security / permissions**: visibility composes with the existing PERM model (hidden-ancestor-wins,
  fail-closed default `dm-only`). Token MOVE is authorized before mutation; a non-DM may move only a
  token they control and never one they cannot see. Hidden-count aggregates are DM-only (zero for a
  non-DM so counts cannot leak existence).
- **Persistence / sync**: every mutation appends a conflict-shaped durable op (`map.poi.*`,
  `map.route.*`, `map.fog.append`, `map.token.*`, `map.overlay.*`) with before/after revisions, keyed
  by annotation id for operation-based merge (Contract 2). Fog is append-only and `sequence`-ordered
  for deterministic replay.
- **Offline**: fog reveal/conceal records a `queued` delivery status when offline but is still
  persisted locally (local-first); the DM sees undelivered status (MAP-012 AC2).
- **UX**: empty states for every list ("No POIs/routes/tokens/fog are visible to you"), an unavailable
  state for a hidden map, search-empty messaging, and a reason surfaced for a blocked overlay mode.
- **Maintainability**: small typed modules per concern (annotations / travel / overlay-modes / query /
  commands); reducers and the query are unit-testable in isolation; no unrelated refactors. New map
  fields default through `normalizeMapEntity`, so older persisted maps stay readable without a
  destructive migration.
- **Docs**: this completion file; extensive module-level doc comments on every new file.

## Known gaps / deferred items

- Per ADR-014 the pixel/canvas renderer remains deferred: annotations are authored/inspected through a
  list/inspector surface, not by dragging on a rendered map. POI/route/token positions are stored in
  normalized space and validated, so a future canvas renderer plugs in without a data change.
- The MCP surface is not implemented in v2 yet (ADR-014 defers the MCP sidecar). MAP-018's MCP clause
  is satisfied structurally: any future MCP map tool must consume `getMapViewForActor` /
  `searchMapsForActor`, the same single filtered model the renderer/search use, so it inherits the
  non-leak guarantee. No raw-`MapState` read path exists for it to misuse.
- Area-of-effect templates (MAP-019) are modeled via the overlay `area-of-effect` mode + the
  `measureRange` primitive (radius from normalized points + scale); a dedicated AoE template record was
  not added, as the prototype's measurement primitive covers the deterministic math the requirement
  calls for without a renderer to draw the shape.
- The `shared` Ruined Keep map requires an active-map projection to reach a player; the e2e proves
  non-leak through view-as filtering (hidden names never in the player DOM) plus the unit test that
  projects it and asserts the hidden token/POI are omitted.

## Status command

`pnpm v2:workpack:set-status -- --epic MAP-pois-routes-fog-and-combat-overlays --status active` (run at
start), then `pnpm v2:workpack:complete -- --epic MAP-pois-routes-fog-and-combat-overlays`.
`pnpm v2:workpack:validate` passes with no drift.

- Workpack status: `complete`.

## Git evidence

- Branch: `epic/MAP-pois-routes-fog-and-combat-overlays`
- Commit: see the final epic commit on this branch (recorded at handoff).
- Final `git status --short` after the completion commit:

```
(clean — recorded post-commit in the handoff report)
```
