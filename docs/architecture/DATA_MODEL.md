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
current build writes. A document at a lower version is migrated; a document at a _higher_
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

Database (`Dexie`): name `dndtools-v2`, version `3`, four object stores:

| Store              | Key schema      | Holds                                                            |
| ------------------ | --------------- | ---------------------------------------------------------------- |
| `documents`        | `&key`          | one record per durable slice (`doc` = the serialized slice)      |
| `operations`       | `&id, sequence` | append-only sync operation log, ordered by `sequence`            |
| `migrationJournal` | `&key`          | write-ahead journal for crash recovery of an in-flight migration |
| `assetBlobs`       | `&id`           | content-addressed map/audio bytes, separate from core documents  |

Packaged desktop releases use the secure, persistent `dndtools://app` origin. The v0.2.0 release used
`file://`; before the normal renderer starts, Electron exports that legacy database through an isolated
hidden renderer, imports it in bounded binary-safe chunks, recomputes a content digest, and writes a
completion marker. The source is never deleted. A main-process ownership marker makes an interrupted
partial target safe to clear and retry, while a pre-existing nonempty target with a different digest
fails closed. Only explicitly reviewed non-secret preferences migrate; session storage and origin-bound
folder handles do not.

The Capacitor Android shell uses the same database and transaction path inside the application's
WebView storage. A same-package, same-signature APK upgrade preserves that app-private data; clearing
storage or uninstalling removes it. Android system backup is not the portable vault contract, and the
Keystore-backed secret preferences are explicitly excluded because their key cannot move between
installations. Users export a full local vault to storage outside the app before alpha upgrades; see
[`../runbooks/android-alpha.md`](../runbooks/android-alpha.md).

Write path (`persistFullState(previous, next)`):

1. The request is validated at the platform-service boundary
   (`validatePlatformRequest` against a named-method schema with a payload-size limit);
   an unknown method, oversized, or malformed payload fails closed
   (`PlatformBoundaryRejectionError`).
2. An op-growth guard enforces the core discipline: if any durable slice changed but no
   new accepted operation was produced, the write is rejected. This is what makes
   "durable state only ever changes through a command" a runtime invariant.
3. All slice documents and the new operation tail are committed in one Dexie transaction. A clone,
   quota, or individual-store failure rolls the entire command back, so a reload cannot observe state
   without its audit operation (or an operation without its state).

Load path (`loadCoreState`) first runs `recoverPendingMigration` (a no-op on a clean
start; on a crashed migration it rolls back to the journal snapshot). A slice that did not
exist in an older vault hydrates to a safe empty/most-restrictive default, and known older
fields pass through their compatibility hydrators. A malformed document, future schema, gap
or duplicate in the operation sequence, malformed operation, or invalid issue time rejects
the entire load; invalid history is never silently dropped to produce a partial vault.

`restoreCoreState` validates a decrypted cloud snapshot completely and atomically replaces
documents, the operation log, and the migration journal. It deliberately preserves local media
bytes because cloud backup carries metadata only. Local vault import uses
`restoreFullVaultState`, which validates content-addressed asset ids/bytes and atomically replaces
all four stores. `resetCoreStorage` atomically clears all four stores.

## 5. Cloud backup artifacts (E2EE)

Cloud backup is end-to-end encrypted. It is a recovery copy with explicit restore, not automatic
multi-device merge. Current v2 envelopes authenticate the exact Cognito account, vault, artifact
kind, and revision as AES-GCM additional data and repeat that binding inside the ciphertext. The
sync service recomputes the expected context from the verified JWT and route metadata; ciphertext
cannot be transplanted between tenants, vaults, artifact kinds, or revisions. Keys are scoped to the
account plus vault in the Electron or Android OS credential store. Legacy unbound v1 envelopes are
recognized only to
give a migration message and are never restored; the originating local vault must upload a fresh v2
copy. The wire contract is in
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
- Hydration must be fail-closed: an absent legacy slice may use a documented safe default, but a
  malformed persisted document or operation log must reject the whole load, never partially parse.
- A future (higher) schema version must fail closed with an upgrade-required diagnostic.
- Durable state must never change except through an accepted core operation (enforced by
  the `persistFullState` op-growth guard).
