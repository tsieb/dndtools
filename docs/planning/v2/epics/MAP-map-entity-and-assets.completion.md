# Completion Evidence: MAP-map-entity-and-assets

Epic: `MAP-map-entity-and-assets` — MAP: Map entity and assets
Requirements covered: **MAP-001, MAP-002, MAP-020**
Architecture contracts: Contract 1 (Processing/Display Decoupling), Contract 3 (Role, Visibility & Permission Grant Model), Contract 4 (Scene/Widget Contract).

## Summary

Delivered the durable map-entity creation and safe-import capability branch, building on (not duplicating) the existing map entity/layer model, the PERM default-visibility fail-closed model, the storage-adapter + command-lifecycle, the write-ahead/safety-snapshot recovery discipline, and the declared-adapter/capability-descriptor pattern.

- **MAP-001** — `map.create` durable Processing-Core command: creates a map entity with name, scale, projection metadata, default visibility, and an initial layer set. Default visibility fails closed to `dm-only` when omitted; bad scale/projection are rejected fail-closed before any mutation; a fresh map always gets at least one layer.
- **MAP-002** — content-addressed asset model + adapter gating: `map.import-asset` hashes image/SVG bytes into a content-addressed id (identical bytes dedupe to one asset; the hash is the integrity checksum). External scene formats require a DECLARED ADAPTER (a typed capability descriptor like the platform capability descriptors); with no declared adapter, import is rejected fail-closed. Size/MIME validated before any storage mutation.
- **MAP-020** — `map.commit-import` is a transaction: a pure read-only preview produces an adapter capability summary + non-leaking per-element diagnostics (importable/lossy/unsupported), and a pure staged-then-commit reducer guarantees that a rejected/cancelled import leaves the prior state byte-identical (no partial commit). Unsupported elements are reported on the durable op, never silently dropped.

Architecture: hashing/validation/staging are pure, deterministic Processing-Core policy (no DOM, no `crypto.subtle`, no ambient state). The GUI dispatches import intents and renders the preview/diagnostics model; it never touches storage. Boundary lint stays green with no new platform-access exception.

## Files changed

New (core):
- `apps/v2/packages/core/src/state/map-assets.ts` — content-addressed `MapAsset`, deterministic `hashAssetBytes` (FNV-1a 64-bit), native MIME table, fail-closed `buildMapAsset`.
- `apps/v2/packages/core/src/state/map-import.ts` — typed adapter registry (`createMapImportAdapterRegistry`), read-only `previewMapImport` (capability summary + element diagnostics), pure transactional `stageMapImport`.
- `apps/v2/packages/core/src/commands/map-entity.ts` — `handleCreateMap` (MAP-001), `handleImportMapAsset` (MAP-002), `handleCommitMapImport` (MAP-020).
- `apps/v2/packages/core/tests/map-entity-and-assets.test.ts` — unit coverage.

New (app):
- `apps/v2/app/src/lib/gui/MapAuthoringPanel.svelte` — DM-only create-map form + safe-import preview/diagnostics/rollback surface.
- `apps/v2/app/tests/e2e/map-entity-and-assets.spec.ts` — Playwright e2e (both projects).

Modified (core):
- `state/map-state.ts` — added `MapScale`, `MapProjection`, `MapEntity.scale/projection/assetIds`, `MapState.assets`, `normalizeMapEntity`, `DEFAULT_MAP_PROJECTION`, `SUPPORTED_MAP_PROJECTIONS`; updated demo seed.
- `schemas/commands.ts` — `createMapInputSchema`, `importMapAssetInputSchema`, `commitMapImportInputSchema` (fail-closed scale/projection refines, byte payload schema, adapter-format gating).
- `commands/types.ts` — three new `CoreCommand` types, two new `CoreEvent`s, optional `CoreEnvironment.mapImportAdapters`.
- `commands/dispatch.ts` — wired the three handlers, resolving the adapter registry from env (empty registry default ⇒ external imports fail closed).
- `commands/helpers.ts` — `ensureMapState` now seeds `assets`.
- `index.ts` — public exports for the new asset/import/state surface and schemas.
- `testing/fixtures.ts` — `makeEnvironment` passes through `mapImportAdapters`; initial state seeds `assets`.
- `tests/map-projection-consistency.test.ts` — uses `normalizeMapEntity` for the new required fields.

Modified (app):
- `canvas-runtime/runtime.svelte.ts` — declared the prototype `vtt-scene` adapter, exposed `runtime.mapImportAdapters`, seeded `assets` in initial state, wired adapters into the env.
- `platform/storage/scene-store.ts` — defaults `assets` for pre-MAP-002 persisted map docs (backward compatible).
- `routes/atlas/+page.svelte` — mounts the DM-only authoring panel.

Modified (planning, via workpack commands only):
- `docs/planning/v2/workpack-state.yaml`, `status.yaml`, `epics/MAP-map-entity-and-assets.yaml` (generated).

## Traceability (requirement → code → tests)

| Requirement | Code | Tests |
| --- | --- | --- |
| MAP-001 (create map entity; default visibility fail-closed; validate inputs) | `commands/map-entity.ts#handleCreateMap`, `schemas/commands.ts#createMapInputSchema`, `state/map-state.ts` (`MapScale`/`MapProjection`/`normalizeMapEntity`) | unit `map-entity-and-assets.test.ts` "MAP-001 map.create" (AC1 record persisted; AC2 dm-only default; bad scale/projection rejected byte-identical; non-DM rejected); e2e "MAP-001 create a map entity" (dm-only default + reload persistence + DM-only panel) |
| MAP-002 (content-addressed import + adapter gating) | `state/map-assets.ts`, `state/map-import.ts` (registry), `commands/map-entity.ts#handleImportMapAsset` | unit "MAP-002 content-addressed asset hashing" + "MAP-002 map.import-asset / adapter gating" (AC1 dimensions/checksum/source/link; dedupe; AC2 oversized rejected pre-mutation; AC4 undeclared external rejected fail-closed; non-native MIME rejected); e2e "MAP-002 content-addressed import + adapter gating" |
| MAP-020 (preview + capability summary + diagnostics + rollback) | `state/map-import.ts` (`previewMapImport`/`stageMapImport`), `commands/map-entity.ts#handleCommitMapImport` | unit "MAP-020 preview + diagnostics + rollback" (AC1 classify each element; preview pure/non-mutating; AC2 cancel = byte-identical rollback; AC3 commit writes + reports dropped; all-unsupported rejected; duplicate-format registry throws); e2e "MAP-020 safe import: preview + diagnostics + rollback" |

## Demo path

1. `pnpm v2:dev`, open `/atlas/` as the default DM.
2. **Create (MAP-001):** in "Map authoring → Create a map", enter a name, scale (e.g. `300` `feet`), projection, leave visibility default → "Create map". The map appears in the Atlas list. Switch the "view as" control to a player: the map is absent (dm-only default). Reload: the map persists (durable storage).
3. **Native import (MAP-002):** in "Import a map", keep "Image / SVG (native)", set a file name, "Preview import". The preview shows a content-addressed asset id (`fnv1a64-…`). "Commit import" creates an imported map; the store summary count rises. Previewing the same file again shows the same id (dedupe).
4. **Adapter gating (MAP-002):** choose "External scene format", enter an undeclared format id (e.g. `roll20-archive`), "Preview import" → a fail-closed diagnostic ("No declared adapter…") with no commit control; the store is unchanged.
5. **Safe import (MAP-020):** enter `vtt-scene`, check `dimensions`, `walls`, `lights`, "Preview import". The capability summary + per-element diagnostics classify each element; `lights` is reported as dropped. "Cancel (rollback)" leaves the store byte-identical; "Commit import" applies the staged map atomically and records the dropped element on the durable op.

## Tests run

- `pnpm v2:test` → core 682 passed (56 files), app 55 passed (12 files). 0 failures.
- `pnpm --filter @dndtools/v2-app exec playwright test` (FULL suite, BOTH projects desktop-chromium + mobile-chromium) → **190 passed, 18 skipped (intentional project-scoped skips), 0 failed**. Baseline was 178 passed; the 12 new map-entity/assets specs bring it to 190.
- `pnpm v2:typecheck` → 0 errors. `pnpm v2:lint` (boundary) → passed. `eslint` on touched files → 0 problems.
- `pnpm v2:workpack:validate` → passed.

## Quality review

- **Correctness:** every mapped acceptance criterion has a unit and/or e2e test, including negative fail-closed cases (bad scale/projection, oversized asset, undeclared external format, all-unsupported import, non-DM actor).
- **Architecture:** hashing/validation/staging are pure deterministic core; the GUI dispatches intents and renders the pure preview model; no GUI storage access; no v1 runtime import; ADR-014 binary stance respected (hash + metadata + content-addressed reference, no blob CDN). Adapter registry mirrors the platform capability-descriptor pattern; transactional rollback reuses the staged-then-commit discipline of the write-ahead/safety-snapshot recovery.
- **Tests:** unit (hashing/dedupe/validation/adapter-gating/staging/rollback) + e2e on both profiles + boundary lint.
- **Accessibility:** authoring controls use labelled form inputs; the preview error uses `role="alert"`; diagnostics are a list with stable testids. The flow runs identically on the mobile-chromium profile (presentation-equivalent, not forked).
- **Performance:** hashing is a single linear pass over bounded bytes (≤ 8 MiB default cap); staging is O(maps) shallow copies.
- **Security/privacy:** diagnostics are non-leaking (element kinds + reasons only, never raw external payload contents). Imported maps and assets default to `dm-only` (fail closed). The content hash is the integrity check.
- **Permissions:** all three commands are DM-only; the authoring panel renders nothing for players/observers (verified by e2e).
- **Persistence:** assets/maps persist through the existing storage adapter + command lifecycle; pre-epic map docs are normalized (`assets` defaulted) without a destructive migration.
- **Sync/offline:** each command appends a conflict-shaped durable op (before/after revision, content-addressed asset reference) — offline-safe and replayable; no network used.
- **UX:** create + import flows have explicit preview, commit, and cancel (rollback) affordances and a live store summary.
- **Maintainability:** small typed modules; pure reducers separated from command gating; no speculative abstraction (no real blob CDN).
- **Docs:** this completion file; inline module docs trace each requirement.

## Known gaps / deferred items

- Binary handling is prototype-appropriate per ADR-014: asset bytes are modeled as a serialized `Uint8Array` and the deliverable is the content hash + metadata + content-addressed reference. A real blob store/CDN and actual image-dimension extraction from raw bytes are deferred (the GUI passes optional dimensions; the core records them as provided).
- The declared `vtt-scene` adapter classifies element kinds but does not yet translate external geometry into canonical layers/walls/POIs — element-to-canonical mapping is the next MAP editing/generation territory; this epic delivers the gated, previewed, rollback-safe import boundary.
- A real file picker is out of scope; the prototype uses a deterministic byte payload so dedupe is observable.

## Stop conditions

None hit. The v2 stack ADR is present and consistent; no v1 runtime import was required; visibility/permission behavior was unambiguous (DM-only authoring, dm-only fail-closed defaults); the workpack validates; no unrelated overlapping changes.

## Git

- Branch: `epic/MAP-map-entity-and-assets` (created from `epic/MAP-map-editing-and-generation` HEAD `06e5b95`).
- Commit: recorded at handoff (see final report).
- Final `git status --short`: clean (recorded in the final report after commit).
- `pnpm v2:workpack:complete -- --epic MAP-map-entity-and-assets` (at completion).
- Workpack status: `complete`.
