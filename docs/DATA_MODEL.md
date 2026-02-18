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

Objects are now primarily persisted as note-backed entities.

### 1.6 MCP Change Record

Staged MCP change lifecycle:
- pending
- approved
- rejected

Payload includes before/after note snapshots and optional preview diff summary.

## 2. Storage Adapter Contract

Required interface is defined in `src/lib/types/storage.ts` and includes:
- lifecycle
- notes CRUD + queries
- links
- session boards
- objects
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
- `mcp-changelog.json`

## 4. Link Semantics

Wikilink extraction (`src/lib/services/link-extractor.ts`) supports:
- `[[Title]]`
- `[[Title|Display]]`
- ID hints: `[[note:<id>|Display]]` and `[[id:<id>|Display]]`
- object refs (`obj:`) are excluded from note link graph extraction

## 5. Search Index Model

`src/lib/services/search.ts` indexes:
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

Current UI behavior (`src/lib/services/export.ts`):
- single note export: markdown file
- multi-note export: JSON bundle (`dndtools-vault-export.json`)
- import supports markdown files and JSON bundle format

`TODO(APP):` Add robust portable zip/tar markdown export profile with validation report.
Reason: JSON bundle is DND Tools specific and less interoperable with markdown tools.
Target files:
- `src/lib/services/export.ts`
- `docs/UX_GUIDELINES.md`

## 7. Data Integrity Requirements

Mandatory for future changes:
- every schema change must include migration logic and tests
- persisted date fields must remain ISO-8601 strings
- soft-delete must never remove recoverability in non-permanent mode
- every derived index (links/search/metadata) must be re-derivable from source notes

## 8. Known Gaps and TODOs

`TODO(APP):` Add metadata schema versioning and migration policy for `.vault/*.json` files.
Current issue: `version` fields exist but migration strategy is not formalized.
Target: `mcp/storage.ts`, docs.

`TODO(APP):` Add checksum/journal strategy for filesystem writes.
Current issue: no crash-safe write journal.
Target: `mcp/storage.ts`.

`TODO(APP):` Add strict runtime validation for imported markdown frontmatter and JSON bundle schema.
Current issue: parser is intentionally permissive and can accept malformed inputs.
Target: `src/lib/services/export.ts`.
