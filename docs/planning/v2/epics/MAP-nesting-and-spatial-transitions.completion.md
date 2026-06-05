# Completion Evidence: MAP-nesting-and-spatial-transitions

Epic: `MAP-nesting-and-spatial-transitions` — MAP: Nesting and spatial transitions
Requirements covered: **MAP-008, MAP-009, MAP-017**
Architecture contracts: Contract 3 (Role, Visibility & Permission Grant Model); also obeys Contract 1 (Processing/Display Decoupling) and Contract 4 (Embed/Link/Project rules — embedding references, never clones, the child).

## Summary

Delivered the map nesting and spatial-transition capability branch on top of (not duplicating) the existing map entity/layer model, the PERM visibility model, and the NAV deep-link generic `unavailable` pattern.

- **MAP-008 (embed a map in a map):** a parent map embeds a child as a TYPED REFERENCE + 2D transform (`MapEntity.embeds: MapEmbed[]`), never a copy of the child. The embed stores only the child id, the placement transform (position + uniform scale + rotation), the transition behavior, and the zoom threshold. Because resolution always reads the LIVE child entity, each map keeps its OWN independent layers AND visibility/permission model — a `dm-only` child stays `dm-only` for a player even under a `player-visible` parent (AC2). `map.embed-child` / `map.update-embed` / `map.remove-embed` are DM-only durable commands; removing an embed never deletes the child (Contract 4).
- **MAP-009 (spatial transition parent↔child):** delivered the LOGICAL viewport-transition model (per ADR-014 the pixel renderer is deferred, so no animation). `computeTransitionIntoChild` decides whether a zoom has crossed the embed's threshold and computes the target child-space viewport (parent viewport mapped through the inverse embed transform, clamped to `[0,1]`); `computeTransitionToParent` is the inverse. Transitions are visibility-filtered: a participant can only transition into a child they can see (AC2) — a hidden child yields the generic `unavailable` transition that leaks nothing.
- **MAP-017 (integrity + non-leak):** nesting REJECTS cycles (a map cannot become a descendant of itself — direct and indirect, fail closed, AC1), PRESERVES coordinate transforms across the configured depth (affine compose/invert round-trips a multi-level world→region→city→building chain deterministically, AC2), and surfaces broken/hidden/deleted child links as ONE generic `unavailable` state with no name/content leak — indistinguishable from a missing child to an unauthorized actor (AC3). Configured max depth `MAX_NESTING_DEPTH = 8`, enforced on every embed.

Architecture: graph validation (cycles, depth), ancestor/descendant walks, and affine transform composition/inversion are pure, deterministic Processing-Core functions over plain serializable records (no DOM, no ambient state). The GUI consumes the computed actor-filtered model and never mutates durable state. Boundary lint stays green; no v1 imports.

## Files changed

New (core):
- `apps/v2/packages/core/src/state/map-nesting.ts` — the durable nesting model: `MapEmbed` / `MapEmbedTransform` / `MapTransitionBehavior`, `MAX_NESTING_DEPTH`, graph walks (`descendantMapIds`, `ancestorMapIds`, `subtreeDepth`, `longestPathFromAnyRoot`), 2D affine matrix math (`embedTransformToMatrix`, `composeMatrix`, `composeChain`, `invertMatrix`, `applyMatrix`), validation (`validateAddEmbed` — cycle/self/duplicate/transform/threshold/depth), and pure reducers (`addEmbed`/`updateEmbed`/`removeEmbed`).
- `apps/v2/packages/core/src/queries/map-transition.ts` — the logical viewport-transition model + non-leaking embed resolution: `resolveEmbedsForActor` (actor-filtered; hidden/missing child ⇒ generic `unavailable`), `computeTransitionIntoChild` / `computeTransitionToParent`, `projectPointThroughChain`, `MAP_CHILD_UNAVAILABLE_MESSAGE`.
- `apps/v2/packages/core/src/commands/map-nesting.ts` — `handleEmbedChildMap` / `handleUpdateMapEmbed` / `handleRemoveMapEmbed` (DM-only; compose the pure graph reducer; bump revision; append durable op; emit `map.embed-changed`).
- `apps/v2/packages/core/tests/map-nesting.test.ts` — 38 unit/integration tests (cycle, depth, transform round-trip, transition, non-leak, command lifecycle, pure reducers).

New (app):
- `apps/v2/app/src/lib/gui/MapNestedAreas.svelte` — actor-filtered nested-areas surface: named child + zoom-into-child control for actors who may see it; a single generic non-leaking "unavailable area" placeholder for actors who may not.
- `apps/v2/app/tests/e2e/map-nesting-and-spatial-transitions.spec.ts` — Playwright e2e (both projects).

Modified (core):
- `state/map-state.ts` — added `MapEntity.embeds`; `normalizeMapEntity` defaults `embeds` to `[]` (fail closed, backward-compatible); seeded a demo nested relationship (player-visible "Western Reaches" embeds the `dm-only` "Hidden Outpost").
- `state/map-import.ts`, `commands/map-entity.ts` — `embeds: []` on the two `MapEntity` literal constructions (freshly created/imported maps embed nothing).
- `schemas/commands.ts` — `embedChildMapInputSchema` / `updateMapEmbedInputSchema` / `removeMapEmbedInputSchema` (fail-closed transform/threshold; cycle+depth checked in the reducer against the whole graph).
- `commands/types.ts` — three new `CoreCommand` types, the `map.embed-changed` `CoreEvent`, and two `RejectionCode`s (`nesting-cycle`, `nesting-max-depth`).
- `commands/dispatch.ts` — wired the three handlers.
- `index.ts` — public exports for the nesting model, transition model, and new schemas.

Modified (planning, via workpack commands only):
- `docs/planning/v2/workpack-state.yaml`, `status.yaml`, `epics/MAP-nesting-and-spatial-transitions.yaml` (generated).

## Traceability (requirement → code → tests)

| Requirement | Code | Tests |
| --- | --- | --- |
| MAP-008 (embed at configured transform; preserve child's independent layers + permissions) | `state/map-nesting.ts` (`MapEmbed`, `addEmbed`, `validateEmbedTransform`), `commands/map-nesting.ts#handleEmbedChildMap`, `queries/map-transition.ts#resolveEmbedsForActor`, `schemas/commands.ts#embedChildMapInputSchema`, `state/map-state.ts` (`MapEntity.embeds`) | unit `map-nesting.test.ts` "MAP-008 embed preserves child independence" (AC1 reference-only embed stores no child copy; AC2 dm-only child hidden from player with hard non-leak assertion; shared child not exposed; DM-only command; embed/update/remove lifecycle never deletes child; cycle/missing/invalid-transform rejections); e2e "MAP-008 AC2 a DM-only child stays hidden under a player-visible parent" |
| MAP-009 (scroll/zoom between parent and child within visible data) | `queries/map-transition.ts` (`computeTransitionIntoChild`/`computeTransitionToParent`, `MapViewport`), `state/map-nesting.ts` (transform math) | unit "MAP-009 spatial transition" (AC1 zoom past threshold transitions + child viewport clamped; below threshold no transition; AC2 hidden child blocked with non-leaking unavailable while DM can transition; parent↔child round-trip preserves world area; unknown actor fail closed); e2e "MAP-009 spatial transition is gated by visibility" |
| MAP-017 (cycles, transform preservation across depth, broken-child non-leak, max depth) | `state/map-nesting.ts` (`validateAddEmbed` cycle+depth, `composeChain`/`invertMatrix`, `MAX_NESTING_DEPTH`), `queries/map-transition.ts` (`resolveEmbedsForActor` generic unavailable) | unit "MAP-017 AC1 cycle prevention" (self/direct/indirect cycle rejected, DAG allowed, cycle-safe walks), "MAP-017 max depth enforcement" (covers depth-3 chain; allows at-limit; rejects over-limit incl. deep child subtree), "MAP-017 AC2 transform composition" (identity/scale/rotate/inverse round-trip, degenerate non-invertible, 4-level chain round-trip + determinism, associativity), "MAP-017 AC3 broken/hidden child non-leak" (deleted child generic unavailable names nothing; hidden==missing identical for player; DM distinct bucket no leak; unknown actor fail closed) |

## Demo path

1. `pnpm v2:dev`, open `/atlas/?map=map-western-reaches` as the default DM.
2. **MAP-008 / MAP-009 (DM):** in "Nested areas", the embedded child shows NAMED ("Hidden Outpost") with its transform and a "Zoom into area" control. Click it → "Transition result" reports the child map id (`map-hidden-outpost`) and the computed child-space viewport (logical model; no animation per ADR-014).
3. **MAP-008 AC2 / MAP-017 AC3 (player):** switch the "view as" control to the demo player. The SAME nested area collapses to a single generic "unavailable area" placeholder — no child name, no transform, no zoom control. The string "Hidden Outpost" appears nowhere on the page. Switch to the observer: identical generic placeholder.
4. **MAP-017 (integrity):** cycle and depth rejections are command-level (a `map.embed-child` that would close a cycle is rejected `nesting-cycle`; an over-depth chain is rejected `nesting-max-depth`) — exercised by the unit suite (`map-nesting.test.ts`).

## Quality review

- **Correctness:** every mapped AC is implemented and unit-tested, including fail-closed negatives (cycle, over-depth, zero-scale transform, unknown actor, missing/hidden child). 38 nesting tests pass.
- **Architecture:** graph + transform + viewport math are pure deterministic Processing-Core functions; the GUI renders the computed actor-filtered model and dispatches command intents only. The embed is a reference + transform on the parent (Contract 4), never a clone of the child. Boundary lint green; no v1 runtime imports; `v2:typecheck` clean on both packages.
- **Tests:** unit (graph/transform/viewport/non-leak + command lifecycle), integration (dispatch round-trip), e2e on BOTH Playwright projects. Hard non-leak assertions: the hidden child's id/name never appears in the resolved player payload, transition result, or rendered page.
- **Accessibility:** the nested-areas surface uses a labelled `section`, a heading, list semantics, and `role="status"` for the unavailable placeholder; the zoom control is a real `button` reachable by keyboard and touch. Presentation-equivalent across desktop + mobile profiles (no profile fork).
- **Performance:** graph walks and depth checks are bounded by `MAX_NESTING_DEPTH` and a `visited` set (cycle-safe even on a corrupt synced state); transform composition is O(depth) matrix multiply.
- **Security / permissions:** visibility is evaluated in the core before any child detail is exposed; `shared` and `dm-only` children are both withheld from a bare nesting transition for non-DM actors, consistent with the deep-link resolver. DM-only authoring commands; non-DM embed attempts rejected `actor-not-authorized`.
- **Persistence:** embeds live on the durable `MapState`; every mutation bumps the parent map revision and appends a conflict-shaped durable operation keyed by embed id (operation-based merge, Contract 2). `normalizeMapEntity` defaults `embeds` to `[]` so pre-nesting persisted maps load without a destructive migration.
- **Sync/offline:** durable ops are entity-scoped (parent map) and replayable by embed id; no network dependency — nesting works fully offline (local-first).
- **UX:** the surface shows named children + transition for authorized actors and ONE generic placeholder otherwise; empty state ("This map embeds no other maps.") handled.
- **Maintainability:** small typed modules; the command handlers compose the pure reducer; no speculative abstraction; the generic unavailable message mirrors the established NAV deep-link contract.
- **Docs:** module headers document the model, the permission promise, and the ADR-014 renderer deferral; this completion file records demo + traceability.

## Status command

`pnpm v2:workpack:set-status -- --epic MAP-nesting-and-spatial-transitions --status active` (run at start), then `pnpm v2:workpack:complete -- --epic MAP-nesting-and-spatial-transitions`. `pnpm v2:workpack:validate` passes with no drift.

- Workpack status: `complete`.

## Tests run

- `pnpm v2:test` — core 723 + (new file) → all pass; app 55 pass.
- `pnpm --filter @dndtools/v2-core exec vitest run tests/map-nesting.test.ts` — 38 pass.
- `pnpm v2:typecheck` — 0 errors (core + app).
- `pnpm v2:lint` — boundary lint passed.
- `pnpm --filter @dndtools/v2-app exec playwright test` — full suite on BOTH projects (desktop-chromium + mobile-chromium): **196 passed, 18 intentional skips, 0 failed** (baseline 190 + 6 new nesting tests).
- `pnpm v2:workpack:validate` — passed.

## Known gaps / deferred items

- Per ADR-014 the pixel/canvas rendering engine is deferred, so the transition is the LOGICAL viewport model only (no real scroll/zoom animation). The GUI reflects the computed target viewport.
- The transition "zoom" metric uses the child footprint's fill fraction of the viewport against the configured threshold; a richer continuous-zoom interpolation curve is a renderer-epic concern, not modeled here.
- No stop condition was hit.

## Git

- Branch: `epic/MAP-nesting-and-spatial-transitions` (created from `epic/MAP-map-entity-and-assets` HEAD `074c80c`, per the chained-epic workflow — NOT from master).
- Commit: recorded at handoff (see final report).
- Final `git status --short`: clean (recorded in the handoff report after the commit).
