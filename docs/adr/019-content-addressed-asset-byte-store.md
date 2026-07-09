# ADR-019: Content-Addressed Asset-Byte Store and Source Write-Back Transport

- Status: Accepted
- Date: 2026-07-09
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amends: ADR-014 — lifts two of its explicit deferrals while keeping its storage boundary intact:
  (1) "OPFS and SQLite/WASM are deferred until large assets, map storage … justify them" — the
  justification has now arrived (local audio playback, map raster rendering, file-based media
  import), and the answer stays inside Dexie/IndexedDB rather than OPFS/SQLite; (2) the deferral of
  the `content.write-to-source` external transport, which the whole-app feature-completion pass
  now supplies app-side.

## Context

ADR-014 deliberately kept binary bytes out of the first persistence slice: the core stores
content-addressed asset **metadata** (`maps.assets`, `audio.assets`, id = `fnv1a64` hash of the
bytes) while the bytes themselves had no storage path. That single deferral is now the root cause
of three user-visible incomplete features, each honestly labeled in-UI:

- local/bundled audio sources report `no-stream` and never play (`audio.import-asset` has no byte
  sink);
- map image import is metadata-only and the map canvas paints a stylized placeholder instead of
  the imported raster;
- no file-based media import or whole-vault backup can exist, because there is nowhere to put
  bytes.

The 2026-07 feature-completion pass (see `docs/requirements/FEATURE-GAPS.md`) closes these gaps,
which is exactly the "large assets, map storage … justify them" trigger ADR-014 named. A decision
is needed on **where the bytes live** and **how they cross the platform boundary** without
violating Contract 2 (pure, serializable core state; no binary in the operation log).

## Decision

Store asset bytes in a new **content-addressed blob table inside the existing Dexie database**
(`dndtools-v2`, version 3, table `assetBlobs: '&id'`), owned by the platform storage layer of
`apps/gm-react` — not in core state, not in OPFS, not in SQLite.

Concretely:

- The blob id IS the core's asset id (`assetId(hashAssetBytes(bytes))`), so metadata and bytes can
  never disagree and identical bytes dedupe to one record.
- Access goes through a single adapter, `apps/gm-react/src/platform/storage/assetStore.ts`
  (`putAssetBytes` / `getAssetBytes` / `deleteAssetBytes` / `assetUsage` / `collectGarbage`), plus
  the UI seam `apps/gm-react/src/platform/assetUrl.ts` (`useAssetObjectUrl`, object URLs revoked
  on release). No other module touches the table.
- The platform-service boundary (PLAT-007) gains three allowlisted methods —
  `storage.putAssetBytes` / `storage.getAssetBytes` / `storage.deleteAssetBytes` — that validate a
  small `{id, mime, byteLength}` **descriptor**. Raw bytes never cross the JSON boundary; the
  adapter enforces the byte length against the actual buffer, bounded by the exported
  `MAX_ASSET_BLOB_BYTES` (32 MiB) outer cap. Domain commands keep their own tighter caps
  (`DEFAULT_MAX_ASSET_BYTES` 8 MiB for map images, `DEFAULT_MAX_AUDIO_BYTES` 32 MiB for audio).
- The Dexie version-3 migration is **additive only**: no upgrade function touches the existing
  `documents`/`operations`/`migrationJournal` stores, so the defensive fail-closed hydration and
  the PLAT-008 write-ahead journal remain the sole document-migration paths.
- Lifecycle: `resetCoreStorage` (start-fresh) wipes blobs; `restoreCoreState` (cloud restore)
  **preserves** them, because cloud snapshots carry metadata only; unreferenced blobs are
  reclaimed by an explicit `collectGarbage(referencedIds)` sweep. Eviction or missing bytes render
  the surfaces' honest missing-bytes states — never a crash, never a placeholder pretending to be
  content.
- Quota posture: `navigator.storage.persist()` is requested; `estimate()` drives a soft
  near-capacity warning at 80% and imports that cannot fit are rejected fail-closed.
- The same pass lifts ADR-014's deferral of the `content.write-to-source` (CONTENT-012)
  **transport**: the core command remains the authority/audit gate it already is, and the app
  performs the acknowledged write through the File System Access API (local folder sources) or
  the Google Docs API (OAuth, fail-closed until configured).

## Consequences

### Positive

- Local audio files actually play, imported map rasters actually render, and whole-vault backup
  (state + bytes) becomes possible — three labeled stubs close with one subsystem.
- Content addressing gives free dedupe, integrity checking, and a stable metadata↔bytes contract
  with zero new id bookkeeping.
- Core purity is untouched: no binary in `CoreStateSlice`, the op log, or cloud sync payloads;
  E2EE sync semantics (ADR-015/017) are unaffected because bytes never leave the device.
- Additive Dexie migration carries zero risk to existing vault documents.

### Negative

- Asset bytes are device-local only: they do not sync, and a cloud-restored vault renders
  missing-bytes states until media is re-imported. This is accepted and surfaced honestly in-UI.
- IndexedDB blob storage is subject to browser eviction on non-persisted origins; the persist()
  request is advisory.
- The 32 MiB outer cap makes very large battle maps out of scope for now (consistent with the
  ADR-014 performance posture); raising it later is a one-constant change plus a quota review.
- GC is manual-by-callsite (after deletes/imports/restores); a missed callsite leaks bytes until
  the next sweep, though never correctness.

## Rejected Alternatives

| Alternative                              | Why Rejected                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OPFS (origin-private file system)        | Second storage root alongside Dexie with its own quota/lifecycle; no transactional tie to the DB; Safari/Firefox API gaps; overkill for ≤32 MiB blobs. |
| SQLite/WASM                              | Heavy new dependency and worker plumbing for what is a key→blob lookup; ADR-014's "until relational query pressure" trigger has not fired.             |
| Bytes in core state / operation log      | Violates Contract 2 (serializable pure state) and would balloon the op log and E2EE sync payloads; explicitly out of scope per ADR-014.                |
| Base64 in the existing `documents` table | Same DB but ~33% size inflation, JSON (de)serialization of megabytes on every persistFullState, and no per-blob lifecycle.                             |
| Cloud blob storage (S3) as primary       | Makes local-first playback/rendering network-dependent and creates a plaintext-media custody question ADR-015/017 do not answer today.                 |

## Migration Impact

- `apps/gm-react/src/platform/storage/coreStore.ts`: `DB_VERSION` 2 → 3, additive `assetBlobs`
  table, `restoreCoreState` now preserves blobs (documents/operations semantics unchanged).
- `packages/core`: three new allowlisted platform-service methods + descriptor schemas
  (`packages/core/src/platform/service-boundary.ts`,
  `packages/core/src/schemas/platform-service.ts`); no state, command, or event changes.
- Rollout: ships inside the 2026-07 feature-completion pass; consumers (audio driver, map
  builder, backup) adopt the store in their own workstreams.
- Older vaults: open unchanged (the upgrade adds an empty table); nothing rewrites their
  documents. Downgrade-opening a v3 DB with v2 code fails Dexie's version check — see rollback.
- Tests: `apps/gm-react/src/platform/storage/assetStore.test.ts` (round-trip, dedupe, limits,
  boundary rejection, GC, lifecycle, v2→v3 upgrade preservation) under the new `pnpm test:app`
  suite (`vitest.app.config.ts`).

## Rollback Plan

- Trigger: field reports of vault corruption attributable to the v3 upgrade, or unacceptable
  origin-quota pressure.
- Steps: revert the app to a build with `DB_VERSION` 3 retained but all byte consumers feature-
  flagged off (bytes become inert data); do NOT revert `DB_VERSION` itself — Dexie cannot open a
  database at a higher version than the schema declares, so a true downgrade requires
  export→wipe→re-import via the whole-vault backup flow this pass introduces.
- Data recovery: documents/operations are untouched by the upgrade (additive table), so core data
  needs no recovery; blobs can be dropped wholesale (`assetBlobs.clear()`) with the surfaces
  degrading to their labeled missing-bytes states.
- Known risk: users who imported media between rollout and rollback lose playback/rendering, not
  data integrity.

## Verification and Evidence

- Adapter + seam: `apps/gm-react/src/platform/storage/assetStore.ts`,
  `apps/gm-react/src/platform/assetUrl.ts`.
- Schema/boundary: `apps/gm-react/src/platform/storage/coreStore.ts` (version(3) additive),
  `packages/core/src/platform/service-boundary.ts` (`PLATFORM_SERVICE_METHODS`),
  `packages/core/src/schemas/platform-service.ts` (`MAX_ASSET_BLOB_BYTES`, descriptor schemas).
- Tests: `apps/gm-react/src/platform/storage/assetStore.test.ts` (13 tests incl. v2→v3
  upgrade-preservation proof); `packages/core/tests/platform-service-boundary.test.ts`.
- Ledger: `docs/requirements/FEATURE-GAPS.md` 2026-07 completion-pass section (byte-dependent
  stubs closed there cite this ADR).
