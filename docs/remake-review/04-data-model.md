# Data Model

## Source Set

This document was extracted from:

- `docs/architecture/DATA_MODEL.md`
- `docs/operations/SCHEMA_MIGRATIONS.md`
- `mcp/migrations.ts`
- `mcp/storage.ts`
- `src/lib/types/storage.ts`
- `mcp/fixtures/schema-v1/.vault/index.json`
- `mcp/fixtures/schema-v1/.vault/objects.json`
- `mcp/fixtures/schema-v1/.vault/settings.json`
- `mcp/tools/shared/object-schema.ts`

Additional type definitions were read to resolve field definitions named by the architecture doc:

- `src/lib/types/note.ts`
- `src/lib/types/object.ts`
- `src/lib/types/session-board.ts`
- `src/lib/types/settings.ts`
- `src/lib/types/world-calendar.ts`
- `src/lib/types/session-state.ts`
- `src/lib/types/mcp.ts`
- `src/lib/types/map-fog.ts`
- `src/lib/types/sync.ts`
- `src/lib/domain/object-notes.ts`

`mcp/tools/shared/object-schema.ts` and `src/lib/types/object.ts` are the most current object
taxonomy sources. They include `map` and `handout`; the older architecture summary omits them in
one list.

## Persistence Model

DND Tools stores campaign data as a local markdown vault plus JSON metadata under `.vault/`.
Filesystem storage is implemented by `FileSystemAdapter` in `mcp/storage.ts`. Renderer code is
expected to use the `StorageAdapter` interface, allowing IndexedDB, filesystem, and mobile storage
adapters to share the same contract.

Notes are first-class markdown files with YAML frontmatter. Structured objects are note-backed:
`VaultObject` records are projected into notes using `dndtools.object` frontmatter and generated
markdown content. `objects.json` remains supported for legacy migration, but current save paths
prefer object notes and remove matching legacy object-store records.

## Vault Directory Layout

| Path | Purpose | Shape / schema |
| --- | --- | --- |
| `**/*.md` outside `.vault/` | User notes and object-backed notes. | Markdown body plus managed and custom YAML frontmatter. |
| `.vault/index.json` | Metadata cache for note lookup and link graph. | `{ version, notes, links, aliasIndex }`; fixture v1 lacks `aliasIndex`. |
| `.vault/settings.json` | Vault-scoped app settings. | Partial `AppSettings` plus metadata `version`; fixture v1 contains only `{ "theme": "system" }`. |
| `.vault/session-boards.json` | Session board persistence. | `{ version, boards: Record<string, SessionBoard> }`. |
| `.vault/objects.json` | Legacy object store and migration source. | `{ version, objects: Record<string, VaultObject> }`; current object writes are note-backed. |
| `.vault/object-history.json` | Object history snapshots. | `{ version, history: Record<objectId, VaultObjectHistoryEntry[]> }`, capped to 100 entries per object. |
| `.vault/mcp-changelog.json` | Staged MCP write records. | `{ version, changes: McpChangeRecord[] }`. |
| `.vault/session-state.json` | Live session runtime state. | `SessionState` with `version: 1`. |
| `.vault/write-journal.json` | Interrupted write recovery journal. | `{ version: 1, pending: [{ id, operation, startedAt }] }`. |
| `.vault/backups/manifest.json` | Safety snapshot manifest. | `{ version: 1, snapshots: SafetySnapshot[] }`. |
| `.vault/backups/<snapshotId>.json` | Safety snapshot payload. | Snapshot of notes, index, session boards, objects, object history, and MCP changelog. |
| `.vault/checkpoints/schema-migration-.../` | Schema migration rollback checkpoints. | Copies of touched files, restored on migration failure or by restore UI. |
| `.vault/templates/` | Custom note template markdown files. | Template library seed/user files. |
| `.vault/snippets/` | Reusable snippet markdown files. | Snippet library seed/user files. |

## Top-Level Entity Types

### Note

Authoritative type: `src/lib/types/note.ts`.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `NoteId` | Branded string. |
| `title` | `string` | Display title and managed frontmatter. |
| `content` | `string` | Markdown body without frontmatter. |
| `folder` | `FolderId` | Path-like folder id, root is `/`. |
| `filePath` | `string?` | Relative markdown path for filesystem-backed notes. |
| `tags` | `string[]` | Stored in frontmatter and indexed. |
| `frontmatter` | `Record<string, unknown>` | Custom frontmatter after managed keys are split out. |
| `visibility` | `'dm_only' \| 'shared' \| 'public'` | Defaults to `dm_only`. |
| `createdAt` | `string` | ISO timestamp. |
| `updatedAt` | `string` | ISO timestamp. |
| `deleted` | `boolean` | Soft-delete flag. |
| `deletedAt` | `string \| null` | Soft-delete timestamp. |
| `pinned` | `boolean` | Pinning flag. |
| `pinnedAt` | `string \| null` | Pinning timestamp. |

### Link

Derived from markdown wikilinks and stored in `.vault/index.json`.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `sourceId` | `NoteId` | Source note. |
| `targetId` | `NoteId` | Resolved target note. |
| `displayText` | `string` | Link label from source markdown. |
| `position` | `number` | Position in source note. |
| `resolvedBy` | `'id' \| 'title' \| 'alias'?` | Resolution strategy. |
| `resolvedAlias` | `string \| null?` | Alias that matched. |
| `contextSnippet` | `string \| null?` | Two-sentence backlink context. |

### TagEntry and Folder

`TagEntry` is `{ name: string; count: number }`.

`Folder` is `{ id, name, parent, noteCount }`, where ids are path-like `FolderId` values.

### VaultIndex

Internal cache in `mcp/storage.ts`.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `number` | Current metadata target is `2`. |
| `notes` | `Record<noteId, NoteIndexEntry>` | Title, filename, folder, tags, visibility, aliases, timestamps, deletion state. |
| `links` | `Record<sourceNoteId, StoredLink[]>` | Outbound links by source note. |
| `aliasIndex` | `Record<aliasKey, noteId[]>` | Built from note frontmatter aliases. Added after schema v1. |

### VaultObject

Authoritative types: `src/lib/types/object.ts` and `mcp/tools/shared/object-schema.ts`.

Base fields shared by every object subtype:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `VaultObjectId` | Branded string; also used as the note id for object-backed notes. |
| `type` | `VaultObjectType` | Discriminator. |
| `name` | `string` | Display name and projected note title. |
| `summary` | `string` | Short summary used in embeds; generated if empty. |
| `tags` | `string[]` | Mirrored to projected note tags. |
| `visibility` | `'dm_only' \| 'shared' \| 'public'` | Defaults to `dm_only`. |
| `relationships` | `ObjectRelationship[]` | Graph edges to objects or sessions. |
| `data` | subtype data | Discriminated by `type`. |
| `createdAt` | `string` | ISO timestamp. |
| `updatedAt` | `string` | ISO timestamp. |

Relationship fields:

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'parent' \| 'child' \| 'ally' \| 'enemy' \| 'appears_in_session' \| 'custom'` | Core or custom relationship. |
| `label` | `string?` | Required by schema for `custom`. |
| `targetId` | `VaultObjectId?` | Object target. |
| `sessionId` | `string?` | Session target. |
| `description` | `string?` | Optional edge description. |

### Object Subtype Taxonomy

| Type | Data fields |
| --- | --- |
| `stat_block` | `size?`, `creatureType?`, `alignment?`, `armorClass?`, `hitPoints?`, `speed?`, `challengeRating?`, `abilities`, `traits`, `actions`, `reactions`, `legendaryActions`. |
| `character` | `ancestry?`, `className?`, `level?`, `background?`, `alignment?`, `armorClass?`, `hitPoints?`, `speed?`, `proficiencyBonus?`, `abilities?`, `goals`, `bonds`, `flaws`, `notes?`, `dmNotes?`. |
| `image` | `url`, `alt?`, `caption?`, `credit?`, `width?`, `height?`. |
| `map` | `filePath`, `mimeType?`, `byteSize?`, `width?`, `height?`, `areaNoteId?`, `scale?`, `grid?`, `initialViewport?`, `layers?`, `pois?`, `parentMapId?`, `parentPoiId?`, `routes?`, `lastSessionFog?`. |
| `npc` | `role?`, `ancestry?`, `alignment?`, `disposition?`, `armorClass?`, `hitPoints?`, `goals`, `secrets`, `notes?`. |
| `location` | `locationType?`, `region?`, `population?`, `climate?`, `dangerLevel?`, `features`, `notableNpcIds`. |
| `faction` | `factionType?`, `alignment?`, `influence?`, `leader?`, `goals`, `resources`, `headquartersId?`. |
| `quest` | `status?`, `giverId?`, `objective?`, `reward?`, `dueSession?`, `steps`, `relatedLocationIds`. |
| `item` | `itemType?`, `rarity?`, `attunement?`, `ownerId?`, `value?`, `properties`. |
| `handout` | `title`, `content`, `handoutType`, `sourceNpcId?`, `sourceLocationId?`, `campaignSession?`, `delivered`, `deliveredAt?`, `revealAnimation?`, `visualStyle?`, `cipher?`. |
| `encounter` | `encounterType?`, `challengeRating?`, `environment?`, `objective?`, `participants`, `rewards`. |
| `timeline_event` | `date?`, `worldDateOffset?`, `era?`, `significance?`, `summary?`, `arcTag?`, `linkedSessionNoteId?`, `resolutionStatus?`, `involvedObjectIds`, `consequences`. |

Supporting object data:

- `AbilityScores`: `str`, `dex`, `con`, `int`, `wis`, `cha`.
- `StatBlockEntry`: `{ name, description }`.
- `MapScaleData`: `{ unitsPerGridSquare, unitLabel }`.
- `MapGridData`: `{ type: 'square' | 'hex', visible, originX, originY, cellSize }`.
- `MapViewportData`: `{ zoom, panX, panY }`.
- `MapPoiData`: `id`, `label`, category `city | dungeon | landmark | structure | secret | encounter`, normalized `x/y`, optional layer/note/object links.
- `MapRouteData`: `id`, `name`, style `straight | curved`, waypoint list, optional layer.
- `MapAnnotationLayerData`: `id`, `name`, color theme `amber | emerald | azure | rose | violet | slate`, `visible`, `playerVisible`.
- `MapFogState`: color theme `black | smoky_gray`, `freeExplore`, polygon operations, `updatedAt`.
- `HandoutData`: handout types are `letter`, `map_fragment`, `image`, `cipher`, `rumor`, `document`; reveal animations are `scroll_rollout` and `letter_unfold`.

### Object Graph, Lint, and History

`ObjectRelationshipGraph` contains:

- `nodes`: `{ id, type, name }[]`.
- `edges`: `{ fromId, type, label?, toId?, sessionId?, description?, unresolved }[]`.

`ObjectLintIssue` contains:

- `objectId`, `code`, `message`, `severity: 'error' | 'warning'`, optional `field`, optional
  `suggestedFix`.

`VaultObjectHistoryEntry` contains:

- `id`, `objectId`, `recordedAt`, `reason: 'save' | 'delete' | 'revert'`, and full `object`
  snapshot.

### SessionBoard

Authoritative type: `src/lib/types/session-board.ts`.

Base fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `SessionBoardId` | Branded string. |
| `name` | `string` | Board name. |
| `description` | `string` | Board description. |
| `tiles` | `SessionBoardTile[]` | Grid tiles. |
| `layout` | `SessionBoardLayout?` | Columns, row height, min rows, gap. |
| `style` | `SessionBoardStyle?` | Background and section tint settings. |
| `sessionContext` | `SessionContextState?` | Pinned NPC/location/quest/party notes. |
| `scenes` | `SessionBoardScene[]?` | Scene timeline state. |
| `activeSceneId` | `string \| null?` | Active scene. |
| `handoutHistory` | `SessionBoardHandoutHistoryEntry[]?` | Delivery audit. |
| `createdAt` | `string` | ISO timestamp. |
| `updatedAt` | `string` | ISO timestamp. |

Tile fields:

- `id`, optional `type`, optional `noteId`, preview depth/line count, optional `mapId`,
  `initialZoom`, `combatOverlay`, optional `timer`, `combat`, `encounter`.
- Grid position and size: `x`, `y`, `w`, `h`.
- Optional tile style: background color, border color/width/radius, opacity, scale.

Tile types:

- `note`
- `calendar`
- `timer`
- `combat`
- `encounter`
- `dice`
- `generator`
- `handouts`
- `map`

Combat tile state includes encounter metadata, initiative/round state, combatants, legendary
trackers, lair tracker, notable rolls, map state, outcome text, notes, loot, timestamps, and
`lastLogNoteId`.

Encounter tile state includes party members, stat-block combatants, environment profile, tactical
checklist, computed XP budget, round/active combatant state, legendary/lair trackers, notable
rolls, notes, outcome, timestamps, and `lastLogNoteId`.

Map tile and combat map state share map ids, token placement, difficult terrain, AoE templates,
selected combatant, append-only map history, and fog-of-war state.

### SessionState

Persisted in `.vault/session-state.json`.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Runtime state schema version. |
| `partyLocation` | `SessionPartyLocation \| null` | Map id, normalized coordinates, optional POI id, source, updatedAt. |
| `mode` | `'idle' \| 'active'` | Session mode. |
| `activeSession` | `ActiveSessionState \| null` | Active board, scene, combat, combatants, round, selected references. |
| `sessionRollHistory` | `SessionRollHistoryEntry[]` | Dice/table roll history with breakdowns. |
| `pinnedRollableTableIds` | `string[]` | Session-pinned rollable tables. |

### AppSettings

Persisted in `.vault/settings.json` as partial settings plus metadata `version`; reads are normalized
against `DEFAULT_SETTINGS`.

Main fields:

- Appearance: `theme`, `uiDensity`, `noteReadingWidth`, `reduceMotion`, `highContrast`,
  `sidebarOpen`, `sidebarWidth`, `focusReading`, `playerModeEnabled`.
- Editor: `defaultNoteView`, `editor.fontSize`, `lineHeight`, `showLineNumbers`, `wordWrap`,
  `vimMode`, `splitPane`, `toolbarDensity`.
- Persistence/preferences: `autoSaveDelay`, `trashRetentionDays`, `backupCadence`,
  `backupRetentionCount`, `defaultSort`, `savedSearches`.
- Onboarding: `onboardingComplete`, phase, vault name, milestone booleans, shown/dismissed prompts,
  last seen What's New version.
- Automation context: `templateContext.campaignName`, `sessionNumber`, `characterNames`.
- Dice: `diceMacros[]` with id, label, expression, timestamps.
- MCP: `mcpPolicySettings.defaultPresetId` and per-agent preset map.
- Progressive disclosure: `featureSettings.advanced`, `mcpAccessAcknowledged`, dismissed prompts.
- Help: `seenSpotlights[]`.
- Offline sync: `syncConflictStrategy`, `syncEngineState`.
- Calendar: `worldCalendar`.
- Boards: `boardTemplates[]`.

### WorldCalendar and WorldDate

`WorldDate` is `{ dayOffset: number }`.

`WorldCalendar` fields:

- `version: 1`.
- `months[]`: `{ name, days }`.
- `weekLength`.
- `dayNames[]`.
- `leapYearRules[]`: `{ name, interval, monthIndex, dayDelta }`.
- `eras[]`: `{ name, epochOffset }`.
- `moonCycles[]`: `{ name, periodDays, phaseNames, offsetDays }`.
- `currentDayOffset`.

Timeline events may store `timeline_event.data.worldDateOffset`; legacy/display `date` remains
accepted. Session note in-world dates are read from `frontmatter.worldDate`,
`frontmatter.world_date`, `frontmatter.sessionDateOffset`, `frontmatter.session_date_offset`, or
fallback-parsed `frontmatter.date`.

### MCP Change Record

Persisted in `.vault/mcp-changelog.json`.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Change id. |
| `createdAt` | `string` | ISO timestamp. |
| `resolvedAt` | `string \| null` | Resolution timestamp. |
| `source` | `'mcp'` | Source marker. |
| `type` | `'create' \| 'update' \| 'soft_delete' \| 'restore' \| 'permanent_delete'` | Note mutation kind. |
| `status` | `'pending' \| 'approved' \| 'rejected'` | Staged lifecycle. |
| `noteId` | `string` | Target note id. |
| `title` | `string` | Human-readable target title. |
| `summary` | `string` | Summary of change. |
| `before` | `McpNoteSnapshot \| null` | Previous note snapshot. |
| `after` | `McpNoteSnapshot \| null` | Proposed note snapshot. |
| `preview` | `McpChangePreview?` | Diff and semantic preview. |
| `agentId` | `string?` | Source agent id. |
| `conflict` | `McpChangeConflict \| null?` | Conflict reason/details. |
| `policy` | `McpChangePolicyDecision?` | Preset and decision. |
| `audit` | `McpChangeAuditEntry[]?` | Staged/approved/rejected/auto-approved/conflict-blocked trail. |

## Frontmatter Conventions

Managed note frontmatter keys:

- `id`
- `title`
- `folder`
- `tags`
- `createdAt`
- `updatedAt`
- `deleted`
- `deletedAt`
- `visibility`
- `pinned`
- `pinnedAt`
- `dndtools_integrity`

`dndtools_integrity` is written by the filesystem adapter as:

```yaml
dndtools_integrity:
  version: 1
  contentChecksum: <sha256-of-markdown-body>
```

Custom frontmatter is preserved in `Note.frontmatter`. `summary` is used as a fallback object
summary when `dndtools.object.summary` is absent.

Current note schema version key:

```yaml
dndtoolsSchemaVersion: 2
```

Current object schema version key:

```yaml
dndtools:
  object:
    schemaVersion: 2
```

Object note envelope:

```yaml
dndtools:
  object:
    kind: character
    summary: Veteran agent
    visibility: dm_only
    data:
      ancestry: Human
      className: Fighter
      level: 5
      goals: []
      bonds: []
      flaws: []
    relationships: []
    embed:
      defaultView: card
      defaultOpen: false
      maxDepth: 4
```

In schema-v1 fixtures, regular notes do not have `dndtoolsSchemaVersion`, object notes do not have
`dndtools.object.schemaVersion`, and `.vault/settings.json` may not have a top-level `version`.

## Schema Version History

Current target versions in `mcp/migrations.ts`:

| Area | Current target | Version key |
| --- | --- | --- |
| Notes | `2` | Frontmatter `dndtoolsSchemaVersion`. |
| Objects | `2` | Frontmatter `dndtools.object.schemaVersion`. |
| Metadata | `2` | Top-level `version` in `.vault/*.json`. |

Implemented migration steps:

| Step | From | To | Behavior |
| --- | --- | --- | --- |
| `metadata_v1_to_v2` | 1 | 2 | Sets metadata file `version` to `2`; creates missing `.vault/index.json`, `session-boards.json`, `objects.json`, `mcp-changelog.json`, and `settings.json` with defaults. |
| `notes_v1_to_v2` | 1 | 2 | Adds `dndtoolsSchemaVersion: 2` to markdown note frontmatter. |
| `objects_v1_to_v2` | 1 | 2 | Adds `dndtools.object.schemaVersion: 2` to object-backed note frontmatter. |

Migration behavior:

- `getSchemaMigrationReport(vaultDir)` runs the migration engine in dry-run mode.
- `runSchemaMigrations(vaultDir, { dryRun, createCheckpoint })` applies migrations when not dry
  run.
- Markdown candidates exclude `.vault`, `node_modules`, and hidden directories other than the root
  `.vault` handling.
- Metadata candidates include `index.json`, `session-boards.json`, `objects.json`,
  `mcp-changelog.json`, and `settings.json`.
- `vaultTooNew` is true if any note, object note, or metadata file has a schema version greater
  than the app's current target. Normal opening is refused.
- Applying migrations creates checkpoints by default under
  `.vault/checkpoints/schema-migration-<timestamp>-<id>/`.
- On migration failure, touched files are restored from checkpoint and newly-created files are
  removed.
- Desktop bootstrap and renderer runtime preflight block vault access until required migrations are
  approved/applied.

## Storage Adapter Contract

All storage adapters must implement `StorageAdapter` from `src/lib/types/storage.ts`.

Lifecycle:

- `initialize()`
- `close()`

Notes:

- `getNote(id)`
- `getAllNotes({ includeDeleted }?)`
- `saveNote(note)`
- `deleteNote(id, permanent?)`
- `restoreNote(id)`

Queries:

- `getNotesByFolder(folder)`
- `getNotesByTag(tag)`
- `getRecentNotes(limit)`
- `getDeletedNotes()`
- `resolveTitle(title)`

Links:

- `getLinksFrom(noteId)`
- `getLinksTo(noteId)`
- `setLinksFrom(noteId, links)`
- optional `getAllLinks()`

Session boards:

- `getSessionBoards()`
- `getSessionBoard(id)`
- `saveSessionBoard(board)`
- `deleteSessionBoard(id)`
- `suggestRelatedNotes(noteIds, limit?)`

Vault objects:

- `getObject(id)`
- `getAllObjects({ type, query }?)`
- `saveObject(object)`
- `deleteObject(id)`
- `getObjectRelationshipGraph()`
- `lintObjects()`
- `getObjectHistory(id, { limit }?)`
- `revertObjectToHistory(id, historyEntryId)`

Settings and libraries:

- `getSetting(key)`
- `setSetting(key, value)`
- `getNoteTemplates()`
- `getReusableSnippets()`

Safety snapshots:

- `createSafetySnapshot(reason?)`
- `listSafetySnapshots()`
- `restoreDeletedFromSnapshot(snapshotId)`

Bulk and stats:

- `importNotes(notes)`
- `exportAllNotes()`
- `getNoteCount()`
- `getTagCounts()`

Optional session runtime state:

- `getSessionState?()`
- `saveSessionState?(state)`

Filesystem-specific extensions in `FileSystemAdapter` include metadata integrity scanning/repair,
schema migration reporting/apply, checkpoint listing/restore, imported asset handling, MCP staged
change helpers, and write-journal recovery.

## Carry-Forward Notes for Remake

- Keep the markdown-plus-JSON vault model, but decide early whether `objects.json` is purely a
  migration compatibility artifact or a supported secondary source.
- Preserve object-backed notes as the primary object persistence model; it keeps structured data
  inspectable and portable.
- Preserve explicit schema version keys for notes, object notes, and metadata.
- Keep dry-run migrations, vault-too-new refusal, and checkpoint rollback as non-negotiable
  storage safety requirements.
- Normalize reads against defaults instead of requiring every setting to be present in
  `settings.json`.
- Treat `.vault/index.json` as a rebuildable cache, not the source of truth for note content.
- Preserve staged MCP change records with before/after snapshots, semantic previews, conflicts,
  policy decisions, and audit events.
