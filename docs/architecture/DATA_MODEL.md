# Data Model

The domain model is owned by the framework-independent shared core (`packages/core`,
`@dndtools/core`) and persisted by the React app (`apps/gm-react`) through a single
IndexedDB adapter. The app never mutates durable state directly — every change flows
through a core command into a deterministic reducer, and only the resulting state is
persisted.

## 1. Where the model lives

- **Schemas & types** — `packages/core/src/state/*.ts` (one file per domain slice, e.g.
  `scene-state.ts`, `map-state.ts`, `session-state.ts`, `character-state.ts`,
  `content.ts`, `encounter.ts`, `audio-state.ts`, `permission-state.ts`,
  `mcp-policy.ts`, `command-center-state.ts`, `widget-package-state.ts`) plus the
  command/contract schemas in `packages/core/src/schemas/` (`commands.ts`,
  `scene.ts`, `widget-package.ts`, `platform-service.ts`). All schemas are zod-only.
- **Commands** — `packages/core/src/commands`. **Reducers** — `packages/core/src/state`.
  **Permissions / visibility** — `packages/core/src/permissions`. **Actor-scoped
  queries** — `packages/core/src/queries`. **Source-of-truth registry** —
  `packages/core/src/constraints/source-of-truth.ts`.

There is no `src/lib/types/*` layer and no filesystem markdown-vault model; those
belonged to the retired v1/Svelte runtimes.

## 2. Durable state slices

The persisted state is a fixed set of durable documents, enumerated as
`DurableStateDocumentId` in `packages/core/src/migration/schema-versions.ts`:

`scenes`, `maps`, `permissions`, `session`, `widgets`, `commandCenter`,
`characters`, `content`, `encounters`, `audio`, `mcp`.

(The `mcp` slice is the in-core AI/MCP **policy** state — `packages/core/src/state/mcp-policy.ts` —
not the retired v1 Electron MCP sidecar.)

The sync **operation log** is a twelfth persisted artifact; it is replayed rather than
migrated (each operation carries its own schema version), so it is excluded from the
migration document set.

Each slice declares a `schemaVersion`. `TARGET_SCHEMA_VERSIONS` records the version the
current build writes. A document at a lower version is migrated; a document at a *higher*
version was written by a newer build and fails closed with an upgrade-required
diagnostic rather than being partially parsed (Contract 2).

## 3. Content items and vault objects

The `content` slice (`packages/core/src/state/content.ts`) holds `ContentItem`s. A
content item has `kind: 'note' | 'object'` (`CONTENT_ITEM_KINDS`). An object item carries
a vault-object subtype declared in `packages/core/src/state/vault-object-schema.ts`
(`VAULT_OBJECT_SUBTYPES`): `note`, `character`, `map`, `handout`, `calendar-event`,
`timeline-event`, `dice-table`, `encounter`, `audio-preset`, `widget-package-ref`,
`faction`. Subtype field schemas live in `VAULT_OBJECT_SCHEMAS` in the same file.

## 4. Persistence (Dexie / IndexedDB)

Renderer persistence is implemented once, in
`apps/gm-react/src/platform/storage/coreStore.ts`. It is the only module that touches
IndexedDB; its exported `storagePort` conforms to the type-only `StoragePort` contract.

Database (`Dexie`): name `dndtools-v2`, version `2`, three object stores:

| Store              | Key schema     | Holds                                                             |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| `documents`        | `&key`         | one record per durable slice (`doc` = the serialized slice)       |
| `operations`       | `&id, sequence`| append-only sync operation log, ordered by `sequence`             |
| `migrationJournal` | `&key`         | write-ahead journal for crash recovery of an in-flight migration  |

Write path (`persistFullState(previous, next)`):

1. The request is validated at the platform-service boundary
   (`validatePlatformRequest` against a named-method schema with a payload-size limit);
   an unknown method, oversized, or malformed payload fails closed
   (`PlatformBoundaryRejectionError`).
2. An op-growth guard enforces the core discipline: if any durable slice changed but no
   new accepted operation was produced, the write is rejected. This is what makes
   "durable state only ever changes through a command" a runtime invariant.
3. Changed slices and any new operations are written in one `Promise.all`.

Load path (`loadCoreState`) first runs `recoverPendingMigration` (a no-op on a clean
start; on a crashed migration it rolls back to the journal snapshot), then hydrates every
slice **fail-closed**: a vault persisted before a given slice existed hydrates to a safe
empty/most-restrictive default rather than being migrated destructively.

`restoreCoreState` performs an authoritative bulk load of a decrypted cloud snapshot
(clearing every store first, then rewriting all slices and the whole op log); it
deliberately bypasses the incremental op-growth guard. `resetCoreStorage` clears all
three stores.

## 5. Cloud sync artifacts (E2EE)

Cloud sync is end-to-end encrypted. The wire contract is in
`packages/core/src/sync/cloud-wire.ts`: the server stores an opaque ciphertext envelope
plus a bounded set of allowed metadata classes only (e.g. `operation-size`,
`content-hash` = SHA-256 of the ciphertext) — never plaintext content.
`assertServerSeesOnlyAllowedMetadata` proves that claim before anything leaves the
client. The client side (auth, vault key, sync engine) lives in `apps/gm-react/src/cloud`
(`auth.ts`, `vaultKey.ts`, `syncEngine.ts`, `cloudSync.ts`, `secureStore.ts`,
`tokenStore.ts`). Related core sync building blocks: `operation-log.ts`,
`operation-model.ts`, `local-first.ts`, `replay-validation.ts`,
`cloud-sync-gate.ts` in `packages/core/src/sync`.

## 6. Data integrity requirements

- Every durable slice carries a `schemaVersion`; a schema change must bump it and ship a
  migration (`packages/core/src/migration`) plus tests.
- Hydration must be fail-closed: an unknown/older document defaults to a safe state, never
  a partial parse.
- A future (higher) schema version must fail closed with an upgrade-required diagnostic.
- Durable state must never change except through an accepted core operation (enforced by
  the `persistFullState` op-growth guard).
