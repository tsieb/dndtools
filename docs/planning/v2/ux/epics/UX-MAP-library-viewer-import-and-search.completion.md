# Completion — UX-MAP-library-viewer-import-and-search

UX workpack status: `complete`

Epic: Map Library, Viewer, Import, and Search (phase "06 Core Library Workspaces", P1).
Requirement coverage: `UX-MAP-001` (pan/zoom), `UX-MAP-002` (nested-zoom breadcrumb), `UX-MAP-003`
(minimap), `UX-MAP-006` (map creation form), `UX-MAP-009` (import wizard), `UX-MAP-018` (actor-filtered
map search).

## Summary

Gave the Atlas a real **spatial map viewer** and a cohesive library layout, reusing the foundational
canvas runtime rather than building a maps-only viewport.

- **Map viewer** (new `ux-map/MapViewer.svelte` + `ux-map/map-tiles.ts`): opening a map now embeds the
  shared **`CanvasViewport`** (driven by the one `ViewportController` every spatial route uses), fed the
  map's actor-filtered regions projected into the surface's tile model. This delivers continuous
  drag-pan, scroll/keyboard/pinch zoom, **zoom-to-fit**, an editable zoom %, and the **minimap**
  (UX-MAP-001 / UX-MAP-003) for free — and keeps the renderer-abstraction boundary (a GPU backend
  could replace it without touching maps). The minimap is persistent on roomy profiles and a
  collapsed toggle on the compact profile (UX-MAP-003 mobile default).
- **Wayfinding breadcrumb** (UX-MAP-002): a `<nav aria-label="Map nesting">` above the viewer shows
  `Atlas › <map> [› <focused POI>]`, each crumb a one-click return; the Atlas crumb drops back to the
  library. Region tiles are the already actor-filtered set, so a hidden region never becomes a tile.
- **Atlas library polish:** the page is now a card-based suite — a role-aware lede, a scannable map
  list (each map a row with open + "open at region" affordances), and the DM authoring panel in its
  own card.
- **Creation form (UX-MAP-006)** and **import wizard (UX-MAP-009)**: the existing `MapAuthoringPanel`
  flows (default-dm-only create with projection/scale/visibility; diagnostics-previewed,
  cancel-rollback import) are retained intact within the polished layout.
- **Actor-filtered search (UX-MAP-018):** the existing single actor-filtered query model
  (`map-search-input` in the annotations panel; the deep-link resolver; the command palette) is
  retained — a hidden POI is silently omitted from a player's results and a hidden deep-link target
  resolves to one generic "unavailable".

## Requirement coverage / traceability

| Requirement | Implementation | Test |
|---|---|---|
| **UX-MAP-001** pan/zoom/fit, keyboard + wheel + pinch | `ux-map/MapViewer.svelte` embeds `CanvasViewport` (shared `ViewportController`) | e2e `map-viewer-ux.spec.ts` (viewport + zoom controls visible); reuse already covered by canvas-viewport specs |
| **UX-MAP-002** wayfinding breadcrumb + return | `MapViewer` breadcrumb nav (`map-breadcrumb-atlas`/`-current`/`-selection`) | e2e `map-viewer-ux.spec.ts` (breadcrumb visible; Atlas crumb returns to the library) |
| **UX-MAP-003** minimap overlay (profile-aware) | `CanvasViewport` minimap, `minimap` mode from `useProfile().isCompact` | reused canvas-viewport minimap coverage |
| **UX-MAP-006** creation form (projection/scale/visibility, dm-only default) | `MapAuthoringPanel` create form | e2e `map-editing-and-generation` / `map-entity-and-assets` (`create-map-*`) |
| **UX-MAP-009** import wizard (diagnostics preview, cancel-rollback) | `MapAuthoringPanel` import flow | e2e `map-entity-and-assets` (`import-*`) |
| **UX-MAP-018** actor-filtered search (no hidden-artifact leak) | annotations `map-search-input` + actor-filtered deep-link resolver | e2e `map-pois-routes-fog-and-combat-overlays` MAP-018 (player search empty for dm-only POI) |

## Actor-safety / no-leak evidence

- The viewer's tiles come from `resolvedRegions`, read off the deep-link resolution that only returns
  `restore` when the actor may see the map — a hidden map resolves to one generic `unavailable` that
  names nothing (`map-nesting`/`map-interaction-safety` specs). Region tiles render as visible markers
  (regions carry no per-region visibility; map/layer visibility is enforced upstream).
- Search and deep links share the one actor-filtered query model; `map-pois-…` MAP-018 proves a
  player's search never returns a dm-only POI and the hidden child placeholder leaks no name.

## Tests / gates run

- `pnpm typecheck` — **0 errors, 0 warnings (4748 files)**.
- App vitest — new `ux-map/map-tiles.test.ts` (3) green; full app suite unaffected (no core edits).
- `pnpm lint` — **PASS**. `pnpm docs:validate` — **PASS**.
- Map e2e (8 specs incl. new `map-viewer-ux.spec.ts`), desktop + mobile — **pass**; axe gate `/atlas`
  + touch-target sweep `/atlas` — **pass on both projects**.
- Full Playwright suite, BOTH projects — **see run below**.
- `pnpm ux-workpack:validate` — **PASS**.

## Files changed

New — GUI (`apps/gm/src/lib/gui/ux-map/`):
- `MapViewer.svelte` (breadcrumb + embedded CanvasViewport), `map-tiles.ts` (region→tile projection),
  `map-tiles.test.ts`.

New — tests:
- `apps/gm/tests/e2e/map-viewer-ux.spec.ts`.

Modified — routes:
- `apps/gm/src/routes/atlas/+page.svelte` (mount `MapViewer` in the resolved-map section; card-based
  library layout; scannable map rows).

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-MAP-library-viewer-import-and-search.yaml`.

## Known gaps / deferred

- **Real raster + continuous nested-zoom animation (UX-MAP-001/002 §spec):** the viewer renders the
  map's regions as a schematic over the DOM/CSS canvas baseline (ADR-014 defers the render engine), so
  there is no base-image raster, and "zoom past threshold grows the child out of the parent" is not
  animated — entering a nested child is the explicit `MapNestedAreas` affordance + the breadcrumb. The
  GPU/raster fidelity rides with the canvas-engine decision.
- **Multi-level ancestor breadcrumb:** the routing tracks one `?map=` at a time, so the breadcrumb is
  `Atlas › map › selection`; a full `World › Region › Inn` chain needs the nesting route to carry
  ancestry (deferred with the nested-navigation epic).
- **Creation/import/search visual polish:** the `MapAuthoringPanel` and annotations search keep their
  current (functional, token-consistent) presentation inside the new card layout; a deeper restyle of
  those large surfaces is a follow-up.

## Git evidence

- Branch: `ux/UX-MAP-library-viewer-import-and-search` (off `3d0b55f`).
- Commit: `feat(ux): UX-MAP spatial map viewer (CanvasViewport reuse) + breadcrumb + atlas suite`.

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/src/routes/atlas/+page.svelte
 M docs/planning/v2/ux/epics/UX-MAP-library-viewer-import-and-search.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/gm/src/lib/gui/ux-map/
?? apps/gm/tests/e2e/map-viewer-ux.spec.ts
```
