# Data Model

The domain model is owned by `packages/core` and persisted by `apps/gm-react` through one
IndexedDB adapter. The app never mutates durable state directly: every change is a core command
reduced deterministically, and only the resulting state is persisted.

## 1. Where the model lives

- Slice schemas and types: `packages/core/src/state/*.ts`, one file per slice (`scene-state.ts`,
  `map-state.ts`, `session-state.ts`, `character-state.ts`, `content.ts`, `encounter.ts`,
  `audio-state.ts`, `permission-state.ts`, `mcp-policy.ts`, `command-center-state.ts`,
  `widget-package-state.ts`, `system-package.ts`), plus command and contract schemas in
  `packages/core/src/schemas/`. All schemas are zod.
- Commands `src/commands`, reducers `src/state`, permissions `src/permissions`, queries
  `src/queries`, source-of-truth registry `src/constraints/source-of-truth.ts`.

## 2. Durable slices

`DurableStateDocumentId` (`packages/core/src/migration/schema-versions.ts`) enumerates the twelve
persisted documents: `scenes`, `maps`, `permissions`, `session`, `widgets`, `commandCenter`,
`characters`, `content`, `encounters`, `audio`, `mcp` (AI policy, bindings, proposals, audit),
`systems` (System Packages). The operation log is a thirteenth artifact that is replayed rather
than migrated; each operation carries its own schema version.

Each slice declares a `schemaVersion`; `TARGET_SCHEMA_VERSIONS` records what the current build
writes. A lower version is migrated; a higher version fails closed with an upgrade-required
diagnostic. Cloud-backup restore gates on exact version equality, so additive optional fields are
preferred over bumps:

- `Scene.tombstones?: WidgetTombstone[]` (destroyed widgets, 30-day retention, pruned on the next
  tombstone mutation; [SCENE_HISTORY.md](SCENE_HISTORY.md)).
- `SessionCombatState.tokens` and `templates` (combat tokens keyed by `combatantId`, AoE templates
  cleared on `combat.end`; [COMBAT_ON_MAP.md](COMBAT_ON_MAP.md)). `MapState.tokens` still exists
  beside them pending the MAP_STATE bump ADR-030 calls for.
- `MapFeature` kinds and `props` (ADR-024), `VaultContentState.customObjectTypes` (ADR-023),
  `WidgetAuthoringProvenance.promptHash` (ADR-031).

`systems` hydrates to the built-in D&D 5e package when absent and carries the legacy
`activeWidgetPackageId` in its own field, so the widget-package and system-package id namespaces
are never conflated ([SYSTEM_PACKAGES.md](SYSTEM_PACKAGES.md)). Formulas in System Packages and in
widget `computedFields` share one tiny expression grammar evaluated by the pure `evaluateFormula`.

## 3. Content

The `content` slice holds `ContentItem`s with `kind: 'note' | 'object'`. Objects carry a subtype
from `VAULT_OBJECT_SUBTYPES` (`vault-object-schema.ts`: `note`, `character`, `map`, `handout`,
`calendar-event`, `timeline-event`, `dice-table`, `encounter`, `audio-preset`, `widget-package-ref`,
`faction`, `quest`, `spell`, `session-log`) or a DM-defined `custom:` type; each has a field schema
with `dmOnly` fields projected per role. A subtype may also ride on a `note` via
`fields[VAULT_OBJECT_SUBTYPE_KEY]` (the session-log capture does this). The same slice holds
`CalendarDefinition`s (`calendar.ts`, schema v2: months, weekdays, epoch label, moons, holidays);
moon phases and holidays are derived per date, never stored. Templates, snippets, saved searches,
and relationship edges are content-slice records too.

## 4. Persistence (Dexie)

`coreStore.ts` implements the type-only `StoragePort` contract. Database `dndtools-v2`, version 3:

| Store              | Key             | Holds                                                 |
| ------------------ | --------------- | ----------------------------------------------------- |
| `documents`        | `&key`          | one record per durable slice                          |
| `operations`       | `&id, sequence` | the append-only operation log                         |
| `migrationJournal` | `&key`          | write-ahead journal for crash-safe migration recovery |
| `assetBlobs`       | `&id`           | content-addressed map and audio bytes (ADR-019)       |

Write path (`persistFullState(previous, next)`): the request is validated at the platform-service
boundary (named method, payload-size limit); an op-growth guard rejects any write that changed a
slice without producing an accepted operation; all documents and the new operation tail commit in
one Dexie transaction, so a reload can never observe state without its operation.

Load path (`loadCoreState`): `recoverPendingMigration` rolls back a crashed migration from the
journal; a missing slice hydrates to its safe, most-restrictive default; a malformed document,
future schema, or gap, duplicate, or malformed operation rejects the whole load rather than
producing a partial vault.

`restoreCoreState` validates a decrypted cloud snapshot and atomically replaces documents, log, and
journal while preserving local media bytes (cloud backup carries metadata only).
`restoreFullVaultState` validates asset ids and bytes and replaces all four stores.
`resetCoreStorage` clears them.

Packaged desktop builds use the `dndtools://app` origin; a v0.2.0 `file://` vault is migrated once on
first launch without deleting the source. Android uses the same database inside the WebView; a
same-signature upgrade preserves it, and uninstall removes it, so users export a vault before an
alpha upgrade ([../runbooks/android-alpha.md](../runbooks/android-alpha.md)).

### The player-private store

Private notes, annotated bookmarks, and NPC impressions live in `dndtools-private-<characterId>`
(version 1, stores `notes`, `bookmarks`, `impressions`; `privateStore.ts`), never in
`CoreStateSlice`, the op log, a backup, a view-model, or an MCP read. The only exit is the player
explicitly sharing one NPC impression as a `character.add-journal-entry` command request.
`privateStore.test.ts` holds the three-part leak test ([ADR-035](../adr/035-player-private-device-local-store.md)).

## 5. Cloud artifacts

Cloud backup is end-to-end encrypted with client-held per-epoch keys. V2 envelopes authenticate the
Cognito account, vault, artifact kind, and revision as AES-GCM additional data; the sync-api
recomputes that context from the verified JWT and route, so ciphertext cannot be transplanted.
`packages/core/src/sync/cloud-wire.ts` bounds the server-visible metadata (`operation-size`,
`content-hash`, …) and `assertServerSeesOnlyAllowedMetadata` proves it before upload. Cross-device
reconciliation compares op-logs by operation id and blocks a push on divergence, recording
`<entityType>.merge-conflict` operations that resolve through the ordinary conflict lifecycle
([ADR-037](../adr/037-cross-device-merge-by-op-log-comparison.md)). Legacy v1 envelopes are
recognized only to show a migration message.

## 6. Integrity rules

- Every persisted-shape change bumps `schemaVersion` and ships a migration with tests, unless it
  is an optional additive field an older reader can ignore.
- Hydration is fail-closed: a safe default for an absent legacy slice, rejection for anything
  malformed.
- Durable state never changes except through an accepted operation (the op-growth guard).
