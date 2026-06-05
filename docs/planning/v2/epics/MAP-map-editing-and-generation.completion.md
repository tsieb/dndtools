# MAP-map-editing-and-generation — Completion Evidence

Epic: `MAP-map-editing-and-generation` — MAP: Map editing and generation
Requirement IDs: **MAP-003, MAP-004**
Architecture contracts: Contract 2 (Cloud Sync & Offline Model)
Stories: MAP-003-S01, MAP-004-S02 (each T01 design, T02 implementation, T03 test, T04 demo)

## Summary

The DM can now DRAW/PAINT map content and GENERATE map content procedurally, both built on the
existing MAP layer model (MAP-005) and the existing command-lifecycle inverse/undo system.

- **MAP-003 (draw/paint):** map editing is a Processing-Core command (`map.edit-layer`) that, on
  commit, captures the BEFORE and AFTER content of the affected layer. This makes a paint edit both
  UNDOABLE (the inverse is the same set-content command with before/after swapped, restoring the exact
  prior content) and SYNC-REPLAYABLE (the durable op carries before+after plus before/after layer
  revisions, so another device can apply/merge it — Contract 2). Painted content is saved AS the layer
  (`MapLayer.content`), so the existing actor-filtered layer query omits a `dm-only` layer's content
  entirely from a non-DM read (MAP-003 AC3). The edit fails closed on a locked layer, a stale
  before-base (optimistic concurrency), content outside normalized map space, and a non-DM actor.
- **MAP-004 (procedural generation):** terrain / settlements / dungeons generate DETERMINISTICALLY
  from EXPLICIT parameters plus an explicit seed (`map.generate-layers`). Generation uses a seeded
  PRNG (mulberry32) with NO reliance on `Math.random()` / `Date.now()` / ambient nondeterminism, so the
  same parameters produce BYTE-IDENTICAL layers on every device (the hard Contract 2 sync-replay
  requirement). The result is saved as editable MAP-005 layers (the DM can then paint on them via
  `map.edit-layer`). Validation is fail-closed and runs before any layer is built, so a rejected
  generation persists no partial layers (MAP-004 AC2). Generated layer/feature ids derive from an
  explicit `idPrefix` (no random/time ids), so ids are reproducible too.

All durable mutations enter exclusively through these two commands appended to the operation log via
`appendOperationDraft`; no GUI component reaches storage (Contract 1). Generation reuses the MAP-005
layer model (`normalizeMapLayer`), and editing/generation reducers are pure, deterministic functions.

## Demo

Path (no auth/setup; uses the local demo vault; default actor is the DM):

1. `pnpm v2:dev` (or `pnpm v2:build && pnpm --filter @dndtools/v2-app preview`).
2. Open `/atlas/?map=map-western-reaches`. The map viewport renders the **Layers** panel
   (`data-testid="map-layer-panel"`) with the three seeded layers; each layer now shows a content count
   ("0 marks") and (for the DM) a **Paint** button.
3. **MAP-003 draw + undo:** press **Paint** on Terrain — its count becomes "1 mark". Press **Undo last
   paint** — the count returns to "0 marks" (the inverse restored the exact prior content). Paint again
   and reload the page — the painted mark survives (durable, through the storage adapter).
4. **MAP-003 no leak:** press **Paint** on the `dm-only` Hidden Camps layer, then switch the header
   **View as** control to **Demo Player**. The Hidden Camps layer (and its painted content count) is
   absent entirely — the paint never reached the player.
5. **MAP-004 generation:** as the DM, in the **Generate map layers** form pick a kind (Terrain /
   Settlement / Dungeon) and a seed, then press **Generate**. New layers (e.g. "Generated Rooms",
   "Generated Corridors") appear in the layer list. They are editable — press **Paint** on a generated
   layer and its count rises. Reload — the generated layers persist. Generating again with the SAME
   seed produces the same geometry (determinism is proven in unit tests).

Requirement IDs exercised by the demo: **MAP-003, MAP-004**.

## Traceability (requirement → code + tests)

| Requirement                                                                                                           | Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tests                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MAP-003 (draw/paint; before+after capture for undo and sync; fail-closed)                                             | `apps/v2/packages/core/src/state/map-editing.ts` (pure `applyLayerEdit` + `featuresEqual` + `layerContent`), `apps/v2/packages/core/src/commands/map-editing.ts` (`handleEditMapLayer`, `buildInverseMapEditCommand`), `MapLayer.content` + `MapFeature` in `state/map-state.ts`, `editMapLayerInputSchema` in `schemas/commands.ts`, `map.edit-layer` in `command-lifecycle.ts` `UNDOABLE_COMMAND_TYPES`, query `content` in `queries/map-layer-query.ts`, `dispatch.ts`/`types.ts` wiring, GUI `MapLayerPanel.svelte` | `tests/map-editing.test.ts` (reducer undo round-trip, no-mutation, locked/stale/invalid/unknown fail-closed, sibling untouched), `tests/map-editing-commands.test.ts` (op carries before+after; undo restores; AC3 no player leak; non-DM/locked/stale rejected), `tests/command-lifecycle.test.ts` (edit is undoable, inverse type), e2e `map-editing-and-generation.spec.ts` |
| MAP-004 (deterministic procedural generation from explicit params; saved as editable layers; no partial on rejection) | `apps/v2/packages/core/src/state/prng.ts` (seeded PRNG), `apps/v2/packages/core/src/state/map-generation.ts` (`generateMapLayers`, `validateGenerationParams`, terrain/settlement/dungeon), `handleGenerateMapLayers` in `commands/map-editing.ts`, `generateMapLayersInputSchema`, `dispatch.ts`/`types.ts` wiring, GUI generation form                                                                                                                                                                                | `tests/map-generation.test.ts` (PRNG determinism; same params ⇒ identical, different seed ⇒ different; clock-independence; ids from prefix; editable shape; validation fail-closed), `tests/map-editing-commands.test.ts` (generate saves editable layers; determinism via op; AC2 no partial; id-collision reject; non-DM reject), e2e `map-editing-and-generation.spec.ts`   |
| Public core surface                                                                                                   | `apps/v2/packages/core/src/index.ts` (MAP-003/004 export blocks)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | existing `tests/boundary.test.ts` / `tests/type-runtime-split.test.ts` (still green)                                                                                                                                                                                                                                                                                           |

AC mapping highlights:

- **MAP-003-S01 AC1** (paint commits; undo restores prior map state exactly): reducer `applyLayerEdit`
  - inverse via `buildInverseMapEditCommand`; unit "an edit replaces content, and undo restores it
    EXACTLY"; command "a paint edit captures before+after on the durable op and is undoable to the exact
    prior state"; e2e "painting a mark adds content; undo restores the exact prior state".
- **MAP-003-S01 AC2** (async save fails ⇒ pending clears, no identical before/after snapshot recorded):
  the runtime (`runtime.svelte.ts`) rolls back in-memory state and marks the lifecycle `failure` on a
  durable-write throw (existing PLAT-018 path, unit-covered by `command-lifecycle.test.ts`); the edit
  reducer additionally rejects a no-base/stale edit so a no-op snapshot is never appended (command test
  "rejects a stale before-base … and appends no operation").
- **MAP-003-S01 AC3** (paint on a DM-only layer ⇒ player receives no layer payload/visual update):
  content lives on the layer and the actor-filtered `queryMapLayers` omits a `dm-only` layer entirely;
  command test "a paint on a DM-only layer produces NO player-visible payload" (hard leak assertions on
  the serialized result) + e2e "a paint on a DM-only layer never reaches the player view".
- **MAP-004-S02 AC1** (same seed + params reproduce the same editable layer set): `tests/map-generation`
  "the same params + seed reproduce byte-identical layers" for all three kinds + "a different seed
  produces different output"; command test "generates editable layers … same seed reproduces the same
  layer set".
- **MAP-004-S02 AC2** (generation fails validation ⇒ no partial map layers persisted):
  `validateGenerationParams` runs first; unit "rejects an out-of-range dimension and returns NO
  layers"; command test "invalid params are rejected with NO partial layers persisted" (asserts layer
  count and op count unchanged).

## Tests run

- `pnpm --filter @dndtools/v2-core test` — **658 passed** (55 files). Base was 616. Adds 3 new files /
  ~40 cases: `map-editing.test.ts`, `map-generation.test.ts`, `map-editing-commands.test.ts`, plus 1
  new case in `command-lifecycle.test.ts`.
- `pnpm --filter @dndtools/v2-app test` — **55 passed** (12 files), unchanged (no app unit regressions
  from the model/GUI change).
- `pnpm --filter @dndtools/v2-app exec playwright test` (FULL suite, BOTH projects:
  `desktop-chromium` AND `mobile-chromium`) — **178 passed, 18 skipped, 0 failed**. The 18 skips are
  the pre-existing intentional project-scoped skips (dense-grid Scene specs on mobile). Base was 170
  passed; this epic adds 8 e2e tests (4 cases × 2 projects), all in
  `map-editing-and-generation.spec.ts`.
- `pnpm v2:typecheck` — 0 errors (core `tsc --noEmit` + app `svelte-check`, 607 files).
- `pnpm v2:lint` (Processing-Core boundary lint) — passed; the new core modules import no
  Svelte/DOM/platform/v1 code, and the GUI reaches durable state only through `runtime.dispatch`.
- `pnpm v2:gates` — passed (7 gates owned/budgeted/wired).
- `pnpm v2:workpack:validate` — passed (before `complete`, and again after).

## Quality review

- **Correctness**: Both requirements' acceptance criteria implemented and covered by unit + command +
  e2e. Edge cases: undo restores deep-equal content; no-mutation/no-aliasing of input arrays; stale
  before-base rejected (optimistic concurrency); content outside normalized [0,1] rejected; empty
  feature rejected; generation dimension/density/idPrefix validated fail-closed; generated id collision
  rejected; non-DM rejected; siblings untouched.
- **Architecture integrity**: Editing + generation policy is pure `@dndtools/v2-core` (reducers, PRNG,
  generators — Contracts 1/2). Generation reuses the MAP-005 layer model (`normalizeMapLayer`); editing
  reuses the command-lifecycle inverse/undo mapping (`UNDOABLE_COMMAND_TYPES`). Durable mutations enter
  exclusively through `map.edit-layer` / `map.generate-layers` commands appended to the operation log.
  The GUI dispatches command intents and renders the actor-filtered query; it never writes durable
  state. No v1 runtime imports; boundary lint green; ADR-014 honored.
- **Tests**: Unit coverage spans the pure edit reducer (undo round-trip, fail-closed paths), the seeded
  PRNG (stream determinism, bounds), the deterministic generators (byte-identical output, seed
  divergence, clock independence, editable shape, validation), and durable command dispatch (before+
  after op capture, AC3 no-leak, AC2 no-partial, collisions, DM gating). E2e proves the two required
  visible behaviors on BOTH profiles.
- **Accessibility**: New controls (Paint, Undo, generation kind/seed) have labels (visually-hidden
  where compact) and are keyboard/touch reachable with no hover requirement. The panel renders
  identically across profiles, so no profile-specific a11y fork.
- **Performance**: The edit reducer is O(n) over a single layer's content; generation is bounded by
  hard dimension caps (`MIN/MAX_GENERATION_DIMENSION`) so it stays fast and the content stays small for
  the prototype. No new listeners or timers.
- **Security / permissions / visibility**: Editing and generation are DM-only and fail closed for
  player/observer. Painted content lives on the layer and flows through the SAME actor-filtered query as
  the rest of MAP-005/006 — a `dm-only` layer (and its painted content) is omitted entirely from a
  non-DM result, with hard leak assertions (serialized player query never contains the secret feature
  id/style; page body never shows the hidden content).
- **Persistence**: Each edit/generation bumps the parent map revision and appends a conflict-shaped
  durable operation (`map.layer.edit` carrying before+after; `map.layer.generate` carrying the
  deterministic params + generated ids), persisted through the existing Dexie storage adapter
  (`persistMapState`). The e2e reload tests prove the durable round-trip for both a paint and a
  generation.
- **Sync/offline (the crux — Contract 2)**: The edit op carries BEFORE+AFTER content and before/after
  revisions, so it is replayable and idempotent and merges by layer/feature id (the contract's
  "Map layers … operation-based merge by layer/POI/route/fog operation id"). Generation is deterministic
  from explicit params + seed with no ambient nondeterminism, so two devices replaying the same generate
  command produce byte-identical layers (proven byte-for-byte in `map-generation.test.ts`). Fully
  offline — no network dependency. The async-save-failure rollback (MAP-003 AC2) is the existing
  PLAT-018 runtime path.
- **UX**: Per-layer content count, a Paint button, an Undo control disabled when there is nothing to
  undo, and a generation form with kind + seed. Empty/disabled states preserved (locked layers disable
  Paint; the panel adapts to both profiles without a functional fork).
- **Maintainability**: Small typed modules with cohesive responsibilities (PRNG vs edit reducer vs
  generators vs command handlers). The `MapLayer.content` extension is backward-compatible via
  `normalizeMapLayer` (legacy/partial layers read with `content: []`). No speculative abstraction; no
  unrelated refactors.
- **Docs**: This completion file; thorough module/component doc comments tying behavior to MAP-003/004
  and Contract 2.

## Known gaps / deferred

- Map RENDERING of painted/generated geometry is represented in the GUI as a per-layer content count
  and the painted features ARE saved/queried/replayed; a pixel canvas renderer for the strokes/rooms is
  out of scope for this prototype (ADR-014 defers the map rendering engine / canvas strategy). The
  Processing-Core content model, determinism, undo, and sync-replay are fully exercised independent of a
  canvas renderer.
- The paint tool in the GUI emits a fixed deterministic mark rather than tracing pointer input; a real
  brush tool would supply pointer-traced normalized points to the same `map.edit-layer` command — the
  command/reducer accept arbitrary normalized geometry already.
- MAP-003 AC2's async-save-failure path is the existing PLAT-018 runtime rollback (state restored,
  lifecycle `failure`, no operation appended); it is unit-covered at the lifecycle level rather than
  re-tested here, and the edit reducer additionally refuses a no-base edit so a no-op undo snapshot is
  never recorded.
- No stop condition was hit.

## Status commands

- `pnpm v2:workpack:set-status -- --epic MAP-map-editing-and-generation --status active` (at implementation start).
- `pnpm v2:workpack:complete -- --epic MAP-map-editing-and-generation` (at completion).
- Workpack status: `complete`.

## Git evidence

- Branch: `epic/MAP-map-editing-and-generation` (created from `epic/MAP-layers-and-visibility` HEAD `1773517`).
- Commit: the single epic commit on this branch (SHA recorded at handoff).
- Final `git status --short` after committing: clean (no untracked or unstaged files).
