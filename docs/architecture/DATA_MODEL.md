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
- `CommandCenterState.campaign?: CampaignIdentity` (RC-UX-6.2; see below).

`systems` hydrates to the built-in D&D 5e package when absent and carries the legacy
`activeWidgetPackageId` in its own field, so the widget-package and system-package id namespaces
are never conflated ([SYSTEM_PACKAGES.md](SYSTEM_PACKAGES.md)). Formulas in System Packages and in
widget `computedFields` share one tiny expression grammar evaluated by the pure `evaluateFormula`.

### Campaign identity (RC-UX-6.2)

The campaign's name lives in the `commandCenter` document as an optional block,
`campaign: { name, systemPackageId, gmDisplayName }`. `campaign.set-identity` (owner only) is its
only writer. The first naming creates the block. After that the command merges into it, and an
unchanged identity writes no operation. A system or GM name alone cannot create the block. The block
is absent until someone names the campaign, so a vault from before this field reads and writes back
byte-identically, with no schema bump. Nothing stores a default name. "Your campaign" is a
placeholder the app draws while `campaignNameOf` returns `null`. A present block must pass
`isCampaignIdentityShape` (a trimmed name of 1–80 characters with no control characters, and
nullable ids); anything else quarantines the document like any other malformed container.

The sidebar chip, the open vault's switcher row, the Command Center hero and Settings › Players'
Create invite read this one name. An invite is minted with it; an unnamed campaign is named by its
first invite, through `campaign.set-identity`.
The device-local vault catalog (`dndtools:react:local-vaults-v1`) is a mirror:
`followCampaignIdentity` (mounted with the shell) renames the open vault's catalog entry whenever
the campaign name changes. In the other direction, a catalog name the GM chose that the campaign
does not carry is adopted, when the vault opens and whenever the catalog announces a rename
(`dndtools:local-vault-renamed`). That covers a vault created or renamed from another vault's
switcher, and onboarding, which names the vault through the catalog; the first naming also
records the active system. The placeholder ("Your campaign", which an onboarding skip writes) is
never adopted.

Players added by name (Settings › Players) go through `permission.add-players` (owner only). It
creates one `player` actor (`{ id, role, displayName }`) per name with a `permission.add-player`
operation, refuses an email-shaped name, and refuses a name already on the roster. The existing
`permission.rename-actor` and `permission.assign-role` then manage those actors. Until a player
owns a PC, the Command Center hero draws them as an avatar after the party's PCs (the `resume`
source's rows after the hero row). The released
`partyNotes` preference (`dndtools:react:invites`, vault-scoped) is migrated into actors once
when the vault opens. Its email entries never reach an actor. They stay in the preference for the
calendar invite that reads them, and the preference is removed once no entries remain.

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

### Wikilinks and typed relationships (RC-KNW-6.1)

`buildWikilinkCandidatesForActor` is the shared target list for resolution, autocomplete,
backlinks and relationship endpoints. Content notes and objects (including faction and quest
subtypes) come from `getContentItemsForActor`; characters from `listCharactersForActor`; maps and
POIs from `getMapViewForActor`, with the actor's delivered-map context. Hidden or deleted targets
never enter the list. An unknown actor gets no targets. Optional character/map/session slices
extend the existing content-only query signatures; full-vault callers pass the current state.

Candidates carry the kind word and destination: `/knowledge/:id`, `/characters/:id`, or
`/atlas?map=:id&poi=:poiId` (omit `poi` for a map). POI graph identifiers include the parent map ID.
Titles and aliases retain the existing case-insensitive matching; the first visible candidate
wins a name collision in resolution and the relationship graph. Unresolved links retain the
existing repair workflow. Character Backlinks use resolved edges, separately from prose mentions.

The Relationships editor offers a To target only when its title resolves to that same entity,
matching autocomplete, and revalidates that identity before saving. A title shadowed by another
entity's title or alias must be renamed before it can be selected as a target. From remains keyed
by entity ID and includes shadowed entities.

Typed edges remain `relations:` frontmatter entries in the form `leads :: Ferry Guild`.
The authored body lives in the content item's `body`, character `data.body`, map `description`,
or POI `notes`. The Relationships editor preserves other frontmatter and prose and writes through
`content.update-item`, `character.edit-field`, `map.update-metadata`, or `map.update-poi`.
The graph is derived from actor-visible bodies; no new relationship store or schema version is
introduced. A redacted character body contributes no private declarations or aliases.

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
journal; damaged documents are quarantined before missing slices hydrate to safe defaults.
A future schema or a gap, duplicate, or malformed operation still rejects the whole load.

`restoreCoreState` validates a decrypted cloud snapshot and atomically replaces documents, log, and
journal while preserving local media bytes and quarantine records (cloud backup carries metadata only).
`restoreFullVaultState` validates asset ids and bytes and replaces all four stores, retaining quarantine records.
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

### Storage pressure and recovery (RC-ENG-6.2)

Settings → Vault checks the browser origin usage/quota on mount, focus and every 30 seconds.
At **80% or above**, an alert offers **Free space** and backup/media-removal guidance. Missing,
invalid or denied estimates remain unknown. Free space prunes only rebuildable embedding vectors
from `assetBlobs`; campaign images/audio and quarantined originals are retained. Estimates cover
the origin, so cache pruning may not clear the alert if other site data dominates usage.

Before hydration, each durable document is validated by running the same hydration the load path
would run on it: the container checks **and** the core hydrator that finishes that slice
(`hydrateSystemsState`, `ensureVaultContentState`, `ensureEncounterState`, `ensureAudioState`,
`ensureMcpPolicyState`, `mergeSystemWidgetPackages`, and the session's combat/audio/calendar/scene-card
hydrators). Container checks alone only inspect top-level shape, so a document whose containers are
intact but whose NESTED record is malformed — a system package with a non-array `attributes`, an
encounter entry list that is not a list, an audio asset with a non-iterable waveform — would
otherwise throw past validation and make the whole vault unopenable with nothing listed to recover.
A damaged document moves atomically to a
unique `quarantine:` record in the existing `documents` table, preserving its original payload,
source key, timestamp and reason. Only after this transaction commits does its absent slice hydrate
with safe defaults; healthy slices continue loading. A quota error aborts the move without deleting
the original. Future schema versions still block opening and roll back the entire quarantine pass;
invalid operation history and migration recovery data remain fatal. Settings → Vault lists quarantine
records across restarts and exports each original inside a recovery JSON envelope. Recovery records
are local data, not diagnostic telemetry, and remain until an explicit vault reset. Ordinary backup
exports do not replace the separate recovery downloads.

`migrateStoredDocuments` runs a migrator against detached documents. Dry-run executes and validates
its output without writing a journal or candidate documents; pending rollback blocks a dry run
until the vault has been reopened and recovered. Real
execution durably writes a committing journal with a deep-cloned safety snapshot before invoking
the migrator, then atomically commits documents and the committed marker. Any thrown migrator or
write error invokes snapshot rollback, preserving original documents and exact absence; restart
recovery handles a process interrupted before rollback. The core planner rejects present documents
with unreadable versions, and `beginMigration` snapshots nested payloads without aliasing the caller.

### Party summaries and full sheets (RC-CHR-6.3)

Party visibility is independent of full-sheet sharing: every registered player receives every
PC's name, portrait asset ID, level, HP/max/temp HP, AC and conditions through the core party
overview. This applies even when the PC sheet is shared only with its owner or is DM-only.
Observers and unknown actors receive an empty overview. Non-PCs retain their existing visibility;
a DM-only NPC never appears to players. Drafts are not party members.

The projection explicitly selects public fields; it never includes the character data bag,
journal, notes, inventory or backstory. Additional resource summaries require sheet access and
respect DM-only resource fields. Party stash items retain their separate item permissions.
Finalization continues to share the full sheet with its owner only. No persisted field or schema
version changes.
