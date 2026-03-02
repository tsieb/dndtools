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
- per-tile style overrides
- board-level layout/style settings

### 1.5 Vault Objects

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

### 1.6 MCP Change Record

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

### 1.7 MCP Policy Settings

Policy settings are persisted in app settings under `mcpPolicySettings`:

- `defaultPresetId`
- `perAgent` map

Preset ids:

- `strict_review`
- `balanced`
- `trusted`

### 1.8 Template Automation Context

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
- `objects.json`
- `object-history.json`
- `mcp-changelog.json`

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
- Portable markdown zip export writes plain `.md` files, `assets/`, `README.md`, and `validation-report.json`.
- Deterministic export mode normalizes timestamps, sorts frontmatter keys, and uses stable IDs for diff-friendly version control.
- Legacy single-note markdown and JSON bundle import/export remain available for compatibility.

## 7. Data Integrity Requirements

Mandatory for future changes:

- every schema change must include migration logic and tests
- persisted date fields must remain ISO-8601 strings
- soft-delete must never remove recoverability in non-permanent mode
- every derived index (links/search/metadata) must be re-derivable from source notes

Schema policy and migration workflow are defined in:

- `docs/SCHEMA_MIGRATIONS.md`
- `mcp/migrations.ts`

## 8. Known Gaps and TODOs

Filesystem write integrity is implemented:

- note and metadata writes use atomic temp-file writes (`mcp/safe-write.ts`)
- startup recovery replays/rolls back pending journal entries (`.vault/write-journal.json`)
- interrupted-write regression tests cover note/index/settings/changelog (`mcp/recovery.test.ts`)

Import runtime now validates frontmatter parseability, UTF-8 encoding, file size bounds, and collision conditions before execution. Blocking issues are skipped with surfaced diagnostics.
