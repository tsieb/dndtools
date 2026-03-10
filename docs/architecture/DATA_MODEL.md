# Data Model

This document reflects the current domain contracts and persistence behavior.

## 1. Core Types

Authoritative files:

- `src/lib/types/note.ts`
- `src/lib/types/settings.ts`
- `src/lib/types/storage.ts`
- `src/lib/types/object.ts`
- `src/lib/types/session-board.ts`
- `src/lib/types/mcp.ts`
- `src/lib/types/world-calendar.ts`

### 1.1 Note

Current shape highlights:

- id: branded `NoteId`
- title, content, folder, tags, frontmatter
- optional `filePath` for filesystem-backed notes
- createdAt, updatedAt
- soft-delete fields: `deleted`, `deletedAt`
- pinning fields: `pinned`, `pinnedAt`

### 1.2 Link

Derived from markdown wikilinks:

- sourceId
- targetId
- displayText
- position

### 1.3 TagEntry

Current runtime contract:

- `{ name: string; count: number }`

### 1.4 Session Board

Board model includes:

- board metadata (`name`, `description`)
- tile layout (`x,y,w,h`)
- tile kinds (`note`, `calendar`, `timer`, `combat`, `encounter`, `dice`, `generator`, `handouts`)
- per-tile style overrides
- board-level layout/style settings
- scene timeline state (`scenes[]`, `activeSceneId`) where each scene stores:
  - title + inline description
  - optional linked description note (`descriptionNoteId`) and optional image path (`imagePath`)
  - linked note ids for entities, references, and open-thread notes
  - optional environment details (`weather`, `timeOfDay`)
- handout delivery audit (`handoutHistory[]`) with `handoutId`, `title`, `sourceKind`, and `deliveredAt`

Combat tile state (`type: combat`) includes:

- encounter metadata (`encounterName`, `systemId`, `round`, `activeCombatantId`)
- combatants with initiative, tie rank, HP/AC, conditions, ready/delay, concentration
- death save tracking for PC rows and `startingHp` baseline for HP-delta logging
- linked object metadata (`linkedObjectId`, `linkedObjectType`, `statsPreview`)
- legendary action trackers (`chargesRemaining`, per-action cost/usage)
- lair action tracker (`initiativeCount`, `lastTriggeredRound`, auto/manual trigger actions)
- notable roll capture (`critical_hit`, `critical_failure`, death-save outcomes)
- encounter outcome text, encounter log draft inputs (`notes`, `loot`), and `lastLogNoteId`
- combat map state (`mapState`) with:
  - map token placements keyed to combatants (`x`,`y` grid cells)
  - difficult terrain overlays and AoE template overlays (`sphere`, `cone`, `line`, `cube`)
  - synchronized map selection (`selectedCombatantId`) and fog-of-war payload:
    `fogState.colorTheme`, `fogState.freeExplore`, and ordered polygon operations
    (`mode: reveal|refog`, `shape`, normalized points)
  - append-only combat map history entries for movement/status/terrain/template/sync/fog events

Encounter builder tile state (`type: encounter`) includes:

- party members sourced from session context linked character objects
- combatant entries sourced from vault stat blocks (`count`, `challengeRating`, `xpPerCreature`)
- computed 5e budget (`easy`, `medium`, `hard`, `deadly`, `baseXp`, `adjustedXp`, `multiplier`, `difficulty`)
- environment linkage (`environmentType`, `environmentNoteId`, `environmentName`)
- tactical checklist derived from environment profile
- legendary/lair tracker seeds and notable-roll capture fields for in-session handoff

### 1.5 World Calendar

App settings now persist a `worldCalendar` object under `.vault/settings.json`.

Schema highlights (`src/lib/types/world-calendar.ts`):

- `version`: currently `1`
- `months[]`: `{ name, days }`
- `weekLength` and `dayNames[]`
- `leapYearRules[]`: `{ name, interval, monthIndex, dayDelta }`
- `eras[]`: `{ name, epochOffset }`
- `moonCycles[]` (max 4 in UI): `{ name, periodDays, phaseNames[], offsetDays }`
- `currentDayOffset`: integer day offset from epoch

Date model:

- `WorldDate` stores `{ dayOffset: number }`
- formatters support `short`, `long`, and `iso` outputs for any configured calendar

### 1.6 Vault Objects

Supported object types:

- `stat_block`
- `character`
- `image`
- `npc`
- `location`
- `faction`
- `quest`
- `item`
- `encounter`
- `timeline_event`

Objects are persisted as note-backed entities and include:

- typed `data` payload by object kind
- `relationships` edges (`parent`, `child`, `ally`, `enemy`, `appears_in_session`)
- history snapshots for revert (`.vault/object-history.json`)

Timeline event payload now supports in-world date storage:

- `timeline_event.data.worldDateOffset?: number`
- legacy/display field `timeline_event.data.date?: string` is still accepted

### 1.7 Session Note In-World Date Frontmatter

Calendar extraction logic reads session note in-world dates from:

- `frontmatter.worldDate` / `frontmatter.world_date`
- `frontmatter.sessionDateOffset` / `frontmatter.session_date_offset`
- fallback parse from `frontmatter.date` when it is a world-date string

### 1.8 MCP Change Record

Staged MCP change lifecycle:

- pending
- approved
- rejected

Payload includes before/after note snapshots and optional preview diff summary.
Preview payload now also includes:

- semantic impact flags (`titleChanged`, `folderChanged`, `frontmatterChanged`, `structural`)
- line delta counts and compact/full diff text
- link impact counts and sampled added/removed targets

Change records may include:

- `agentId` (source agent identity)
- `policy` (preset + decision + reason)
- `conflict` (detected conflict reason/details for pending changes)
- `audit[]` event trail (staged/approved/rejected/auto-approved/conflict-blocked with actor + reason)

### 1.9 MCP Policy Settings

Policy settings are persisted in app settings under `mcpPolicySettings`:

- `defaultPresetId`
- `perAgent` map

Preset ids:

- `strict_review`
- `balanced`
- `trusted`

### 1.10 Template Automation Context

Template rendering now supports vault-level variable context stored in settings:

- `campaignName`
- `sessionNumber`
- `characterNames`

Supported variables include:

- `{{date_iso}}`
- `{{date_pretty}}`
- `{{campaign_name}}`
- `{{session_number}}`
- `{{character_names_csv}}`
- `{{character_names_bullets}}`
- `{{world_date_offset}}`
- `{{world_date_short}}`
- `{{world_date_iso}}`

### 1.11 Offline Sync State

Offline sync metadata is persisted in app settings:

- `syncConflictStrategy`: `'manual' | 'use_latest'`
- `syncEngineState`:
  - `queue[]` deferred replay entries
  - `conflicts[]` three-way conflict records
  - `remoteNotes` mirror snapshots used for ancestor/remote comparison
  - `lastSyncAt`, `lastSyncError`

Queue entries include note-level snapshots for conflict-safe replay:

- `ancestorNote`
- `localNote`
- operation + entity metadata

Conflict records carry explicit three-way snapshots:

- ancestor
- local
- remote

### 1.12 Feature Settings (Progressive Disclosure)

Progressive-disclosure preferences are persisted in app settings under `featureSettings`:

- `advanced`: per-feature booleans for advanced capability enablement
  - `mcp_staged_review`
  - `object_notes`
  - `encounter_builder`
  - `knowledge_graph`
  - `timeline`
  - `handout_delivery`
  - `custom_templates`
  - `theme_presets`
  - `random_tables`
  - `inline_dice_rolls`
- `mcpAccessAcknowledged`: explicit acknowledgement gate for MCP staged-review enablement
- `dismissedPrompts[]`: vault-scoped contextual prompt dismissal memory

### 1.13 Help Spotlight State

Contextual-help spotlight dismissal memory is persisted in app settings under
`seenSpotlights: string[]`.

- each value is a stable spotlight id (`feature-spotlight:<advanced-feature-id>`)
- scoped per vault via `.vault/settings.json`
- once seen, the spotlight will not be shown again for that vault

## 2. Storage Adapter Contract

Required interface is defined in `src/lib/types/storage.ts` and includes:

- lifecycle
- notes CRUD + queries
- links
- session boards
- objects
  - relationship graph projection
  - lint/validation reporting
  - object history + revert
- settings
- import/export
- stats

Runtime write-path behavior now includes a sync wrapper (`src/lib/platform/storage/sync-adapter.ts`)
that records deferred sync metadata without changing the `StorageAdapter` contract.

## 3. Filesystem Vault Format (Implemented)

Primary desktop persistence is markdown files with frontmatter.

Managed frontmatter keys:

- id
- title
- folder
- tags
- createdAt
- updatedAt
- deleted
- deletedAt
- pinned
- pinnedAt

Custom frontmatter is preserved separately in `note.frontmatter`.

Vault metadata files in `.vault/`:

- `index.json`
- `settings.json`
- `session-boards.json`
- `session-state.json`
- `objects.json`
- `object-history.json`
- `mcp-changelog.json`

`session-state.json` currently stores:

- `mode` (`idle` or `active`) and `activeSession` identifiers/timestamps
- active-session combat runtime state:
  - `combatActive`
  - `combatants[]` (`id`, `name`, `kind`, `initiative`, `currentHp`, `maxHp`, `tempHp`,
    `conditions[]`, optional linked object metadata)
  - `currentRound`
  - `activeCombatantIndex`
  - `selectedCombatantId`
  - `referenceObjectId` (selected stat block quick-reference target)
- `partyLocation` map context
- `sessionRollHistory` (session-scoped roll log entries used by Session detail panel)
- `pinnedRollableTableIds` (user-selected table shortcuts for Session Quick Panel)

## 4. Link Semantics

Wikilink extraction (`src/lib/domain/link-extractor.ts`) supports:

- `[[Title]]`
- `[[Title|Display]]`
- ID hints: `[[note:<id>|Display]]` and `[[id:<id>|Display]]`
- object refs (`obj:`) are excluded from note link graph extraction

## 5. Search Index Model

`src/lib/domain/search.ts` indexes:

- title
- content
- tags
- folder
- filePath

Boost settings:

- title: 3
- tags: 2
- content: 1

## 6. Import and Export (Current Behavior)

Current behavior (`src/routes/settings/+page.svelte`, `electron/import-export-service.ts`, `src/lib/domain/import-export.ts`):

- Obsidian import analyzer detects duplicate titles, ID collisions, invalid frontmatter, encoding errors, missing linked files, size-limit violations, and manual-resolution wikilink cases.
- Import runs as a resumable background job with persisted checkpoint state under `.vault/import-checkpoints/`.
- Conflict policy supports `skip`, `overwrite`, or `merge` resolution.
- Portable markdown zip export writes plain `.md` files, an `assets/` directory, a root readme file, and `validation-report.json`.
- Deterministic export mode normalizes timestamps, sorts frontmatter keys, and uses stable IDs for diff-friendly version control.
- Legacy single-note markdown and JSON bundle import/export remain available for compatibility.

## 7. Data Integrity Requirements

Mandatory for future changes:

- every schema change must include migration logic and tests
- persisted date fields must remain ISO-8601 strings
- soft-delete must never remove recoverability in non-permanent mode
- every derived index (links/search/metadata) must be re-derivable from source notes

Schema policy and migration workflow are defined in:

- `docs/operations/SCHEMA_MIGRATIONS.md`
- `mcp/migrations.ts`

## 8. MCP Calendar Contracts

Epic 3.7 calendar-aware MCP additions:

- `get_session_prep_bundle`
  - accepts optional `worldDate` (day offset or world ISO-equivalent string)
  - returns `worldDate` summary and `calendarHighlights[]`
- `get_recap_generation_bundle`
  - accepts optional `worldDate`
  - returns `worldDate` summary and `calendarSummaries[]`
- `get_calendar_events`
  - input: `dateRange { from, to? }`, optional `includeKinds[]`, optional `limit`
  - output: normalized in-world range and matching timeline/session events

Schemas are defined in `mcp/tools/shared/contracts.ts`.

## 9. Known Gaps and TODOs

Filesystem write integrity is implemented:

- note and metadata writes use atomic temp-file writes (`mcp/safe-write.ts`)
- startup recovery replays/rolls back pending journal entries (`.vault/write-journal.json`)
- interrupted-write regression tests cover note/index/settings/changelog (`mcp/recovery.test.ts`)

Import runtime now validates frontmatter parseability, UTF-8 encoding, file size bounds, and collision conditions before execution. Blocking issues are skipped with surfaced diagnostics.
