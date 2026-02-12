# Data Model & Storage Strategy

This document defines the data structures, storage schema, indexing strategy, and migration plan for DND Tools.

---

## Core Entities

### Note

The fundamental unit of content. A note is a markdown document with metadata.

```typescript
interface Note {
  /** Unique identifier. Generated as a nanoid (21 chars, URL-safe). */
  readonly id: NoteId;

  /** Display title. Also used for wikilink resolution. */
  title: string;

  /** Markdown content (raw, not rendered). */
  content: string;

  /** Folder path. Root folder is '/'. Nested: '/campaign/npcs'. */
  folder: FolderId;

  /** User-assigned tags. Stored without '#' prefix. e.g., ['npc', 'waterdeep'] */
  tags: string[];

  /** Parsed from YAML frontmatter block at the top of content. */
  frontmatter: Record<string, unknown>;

  /** ISO 8601 timestamp. Set on creation. */
  createdAt: string;

  /** ISO 8601 timestamp. Updated on every save. */
  updatedAt: string;

  /** Soft delete flag. True = in trash. */
  deleted: boolean;

  /** ISO 8601 timestamp. When the note was soft-deleted. Null if not deleted. */
  deletedAt: string | null;
}

/** Branded type to prevent mixing note IDs with other string IDs. */
type NoteId = string & { readonly __brand: 'NoteId' };
```

### Folder

Virtual folder structure for organizing notes. Not stored separately — derived from note `folder` fields.

```typescript
interface Folder {
  /** Folder path. e.g., '/', '/campaign', '/campaign/npcs' */
  readonly id: FolderId;

  /** Display name. Last segment of the path. e.g., 'npcs' */
  readonly name: string;

  /** Parent folder path. '/' for root-level folders. */
  readonly parent: FolderId;

  /** Number of notes directly in this folder (not recursive). */
  readonly noteCount: number;
}

type FolderId = string & { readonly __brand: 'FolderId' };
```

### Link

Represents a directional link between two notes (from a `[[wikilink]]`).

```typescript
interface Link {
  /** The note containing the wikilink. */
  sourceId: NoteId;

  /** The note being linked to. */
  targetId: NoteId;

  /** The raw text of the wikilink as written. e.g., 'NPC: Barthen' */
  displayText: string;

  /** Position in the source note content (character offset). */
  position: number;
}
```

Links are derived data — extracted from note content by the markdown pipeline. They are stored in a separate table for efficient backlink queries but are always re-derivable from note content.

### Tag

Tags are derived from notes. A tag registry enables autocomplete and tag management.

```typescript
interface TagEntry {
  /** The tag name without '#'. e.g., 'npc' */
  name: string;

  /** Number of notes using this tag. */
  noteCount: number;
}
```

### AppSettings

User preferences persisted locally.

```typescript
interface AppSettings {
  /** Color theme. 'system' follows OS preference. */
  theme: 'light' | 'dark' | 'system';

  /** Sidebar visibility state. */
  sidebarOpen: boolean;

  /** Sidebar width in pixels. */
  sidebarWidth: number;

  /** Default view when opening a note. */
  defaultNoteView: 'read' | 'edit';

  /** Editor configuration. */
  editor: {
    fontSize: number;         // px, default: 16
    lineHeight: number;       // multiplier, default: 1.6
    showLineNumbers: boolean; // default: false
    wordWrap: boolean;        // default: true
    vimMode: boolean;         // default: false
  };

  /** Auto-save debounce interval in ms. */
  autoSaveDelay: number; // default: 500

  /** How long to keep deleted notes before permanent removal. */
  trashRetentionDays: number; // default: 30

  /** Sort order for note lists. */
  defaultSort: {
    field: 'title' | 'updatedAt' | 'createdAt';
    direction: 'asc' | 'desc';
  };
}

/** Key/value record used for persisting AppSettings entries in IndexedDB. */
interface SettingRecord<K extends keyof AppSettings = keyof AppSettings> {
  key: K;
  value: AppSettings[K];
}
```

---

## IndexedDB Schema (Dexie.js)

### Database Definition

```typescript
import Dexie, { type Table } from 'dexie';

class DndToolsDB extends Dexie {
  notes!: Table<Note, string>;
  links!: Table<Link, [string, string]>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('dndtools');

    this.version(1).stores({
      // Primary key is 'id'. Indexed fields follow.
      notes: 'id, title, folder, updatedAt, deleted, *tags',
      // Compound primary key [sourceId, targetId]. Indexed by targetId for backlinks.
      links: '[sourceId+targetId], sourceId, targetId',
      // Key/value settings record keyed by setting name.
      settings: 'key',
    });
  }
}
```

### Index Design

| Table    | Index                    | Purpose                                      |
| -------- | ------------------------ | -------------------------------------------- |
| notes    | `id` (PK)               | Direct note lookup                           |
| notes    | `title`                  | Title search, wikilink resolution            |
| notes    | `folder`                 | List notes in a folder                       |
| notes    | `updatedAt`              | Sort by recent, find stale notes             |
| notes    | `deleted`                | Filter active vs. trashed notes              |
| notes    | `*tags` (multi-entry)    | Find all notes with a specific tag           |
| links    | `[sourceId+targetId]` (PK)| Unique link constraint, direct lookup      |
| links    | `sourceId`               | Get all outgoing links from a note           |
| links    | `targetId`               | Get all backlinks to a note (critical query) |
| settings | `key` (PK)               | Direct setting lookup                        |

### Query Patterns

**Most common queries** (optimize for these):

| Query                           | Access Pattern                           |
| ------------------------------- | ---------------------------------------- |
| Get note by ID                  | `notes.get(id)`                          |
| Get all active notes            | `notes.where('deleted').equals(0)`       |
| Get notes in a folder           | `notes.where('folder').equals(folderId)` |
| Get recent notes                | `notes.orderBy('updatedAt').reverse().limit(n)` |
| Get backlinks for a note        | `links.where('targetId').equals(noteId)` |
| Get outgoing links for a note   | `links.where('sourceId').equals(noteId)` |
| Resolve wikilink by title       | `notes.where('title').equalsIgnoreCase(title)` |
| Get notes with a tag            | `notes.where('tags').equals(tagName)`    |
| Search notes (full-text)        | MiniSearch in-memory index (not IndexedDB) |

---

## Schema Migrations

Dexie handles schema versioning. Each version bump includes the migration logic:

```typescript
// Example: Adding a 'pinned' field in version 2
this.version(2).stores({
  notes: 'id, title, folder, updatedAt, deleted, pinned, *tags',
  links: '[sourceId+targetId], sourceId, targetId',
  settings: 'key',
}).upgrade(tx => {
  return tx.table('notes').toCollection().modify(note => {
    note.pinned = false;
  });
});
```

**Migration rules**:
1. Never remove an index without migrating data first
2. New fields must have sensible defaults applied in the upgrade function
3. Test migrations with real data before releasing
4. Keep a changelog of schema versions in this document

### Version History

| Version | Changes                        | Date       |
| ------- | ------------------------------ | ---------- |
| 1       | Initial schema: notes, links, settings | TBD  |

---

## Data Lifecycle

### Note Creation

```
User triggers "New Note"
  → Generate NoteId via nanoid()
  → Create Note object with defaults:
      title: "Untitled"
      content: ""
      folder: current active folder
      tags: []
      frontmatter: {}
      createdAt: now()
      updatedAt: now()
      deleted: false
      deletedAt: null
  → Save to IndexedDB
  → Navigate to editor for the new note
```

### Note Update (Auto-Save)

```
User edits content in CodeMirror
  → Editor store receives change
  → Debounce timer starts (500ms)
  → On debounce fire:
      → Update note.content
      → Update note.updatedAt to now()
      → Parse frontmatter from content → update note.frontmatter
      → Parse tags from frontmatter and inline #tags → normalize + de-duplicate → update note.tags
      → Save to IndexedDB
      → Re-extract links → diff against existing links → update links table
      → Re-index note in MiniSearch
```

### Note Deletion (Soft Delete)

```
User triggers "Delete Note"
  → Confirmation dialog (shows backlink count)
  → On confirm:
      → Set note.deleted = true
      → Set note.deletedAt = now()
      → Save to IndexedDB
      → Note disappears from active views
      → Note remains in "Trash" folder view
      → Links from this note are preserved but inactive
```

### Note Permanent Deletion

```
Periodic cleanup (on app startup or daily):
  → Query notes where deleted = true AND deletedAt < (now - retentionDays)
  → For each:
      → Delete all links where sourceId = noteId
      → Delete all links where targetId = noteId
      → Delete the note record
      → Remove from MiniSearch index
```

### Note Restoration

```
User clicks "Restore" on a trashed note:
  → Set note.deleted = false
  → Set note.deletedAt = null
  → Update note.updatedAt to now()
  → Save to IndexedDB
  → Re-activate links
  → Re-index in MiniSearch
```

---

## Link Resolution

Wikilinks are resolved by matching the link text against note titles:

```typescript
function resolveWikilink(linkText: string, allNotes: Note[]): NoteId | null {
  // 1. Exact title match (case-insensitive)
  const exact = allNotes.find(
    n => n.title.toLowerCase() === linkText.toLowerCase() && !n.deleted
  );
  if (exact) return exact.id;

  // 2. No match — return null (link is "unresolved")
  return null;
}
```

**Unresolved links**: Rendered with a distinct style (dashed underline, muted color). Clicking creates a new note with that title.

**Ambiguous links** (future consideration): If multiple notes match, show a disambiguation popup.

**Display aliases**: Support `[[Note Title|Display Text]]` syntax where the link target is "Note Title" but the rendered text is "Display Text".

---

## Frontmatter Schema

Notes support YAML frontmatter for structured metadata:

```yaml
---
title: "Barthen's Provisions"
tags: [npc, phandalin, merchant]
type: location        # Optional: categorization beyond tags
status: active        # Optional: note lifecycle tracking
campaign: LMoP        # Optional: campaign association
---
```

**Frontmatter rules**:
- `title` in frontmatter overrides the first `# Heading` as the note title
- `tags` in frontmatter merge with inline `#tag` syntax
- Unknown fields are preserved but not indexed
- Frontmatter is parsed on save and stored in `note.frontmatter`
- The markdown pipeline strips frontmatter from rendered output

---

## Search Index

MiniSearch is configured as the client-side full-text search engine:

```typescript
import MiniSearch from 'minisearch';

const searchIndex = new MiniSearch<Note>({
  fields: ['title', 'content', 'tags'],
  storeFields: ['id', 'title', 'folder'],
  searchOptions: {
    boost: { title: 3, tags: 2, content: 1 },
    fuzzy: 0.2,
    prefix: true,
  },
});
```

**Index lifecycle**:
- **Build**: On app startup, load all active notes and add to index
- **Update**: On note save, remove old entry and add updated entry
- **Delete**: On note deletion, remove from index
- **Rebuild**: On data import, rebuild entire index

**Performance**: MiniSearch can index ~1000 notes in < 100ms and search in < 10ms. Well within budget for the expected vault sizes.

---

## Data Export / Import

### Export Format

Notes are exported as a zip file containing standard markdown files:

```
vault-export-2024-01-15/
├── campaign/
│   ├── npcs/
│   │   ├── barthen.md
│   │   └── sildar.md
│   ├── locations/
│   │   └── phandalin.md
│   └── session-notes/
│       ├── session-01.md
│       └── session-02.md
└── characters/
    └── my-character.md
```

- Folder structure matches the virtual folder structure
- File names are slug-ified note titles
- Frontmatter is included at the top of each file
- Wikilinks are preserved as-is (standard Obsidian-compatible format)

### Import Format

Support importing:
1. **Individual markdown files**: Each file becomes a note
2. **Zip of markdown files**: Folder structure is preserved
3. **Obsidian vault export**: Direct compatibility — same markdown + wikilink format

**Import rules**:
- Duplicate detection by title (prompt user to skip, rename, or overwrite)
- Frontmatter is parsed and stored
- Tags are extracted from frontmatter
- Links are re-indexed after import
- Large imports (> 100 files) show a progress indicator

---

## Storage Abstraction

All data access goes through the `StorageAdapter` interface. This is the critical abstraction that enables future migration from local to cloud storage.

```typescript
interface StorageAdapter {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Notes - CRUD
  getNote(id: NoteId): Promise<Note | null>;
  getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]>;
  saveNote(note: Note): Promise<void>;
  deleteNote(id: NoteId, permanent?: boolean): Promise<void>;
  restoreNote(id: NoteId): Promise<void>;

  // Notes - Queries
  getNotesByFolder(folder: FolderId): Promise<Note[]>;
  getNotesByTag(tag: string): Promise<Note[]>;
  getRecentNotes(limit: number): Promise<Note[]>;
  getDeletedNotes(): Promise<Note[]>;
  resolveTitle(title: string): Promise<Note | null>;

  // Links
  getLinksFrom(noteId: NoteId): Promise<Link[]>;
  getLinksTo(noteId: NoteId): Promise<Link[]>;
  setLinksFrom(noteId: NoteId, links: Link[]): Promise<void>;

  // Settings
  getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]>;
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;

  // Bulk operations
  importNotes(notes: Note[]): Promise<ImportResult>;
  exportAllNotes(): Promise<Note[]>;

  // Stats
  getNoteCount(): Promise<number>;
  getTagCounts(): Promise<TagEntry[]>;
}
```

**Implementations**:

| Adapter              | Environment | Backing store            | Used by           |
| -------------------- | ----------- | ------------------------ | ----------------- |
| `IndexedDBAdapter`   | Browser     | IndexedDB via Dexie.js   | Web application   |
| `FileSystemAdapter`  | Node.js     | Markdown files on disk   | MCP server        |
| `CloudAdapter`       | Both        | Remote API + local cache | Future (Phase 5)  |

The adapter is instantiated once at app startup (or MCP server startup) and provided to consumers via dependency injection (Svelte context, module-level singleton, or constructor parameter).

---

## FileSystem Adapter (MCP Server)

The `FileSystemAdapter` implements `StorageAdapter` for the MCP server, operating on a directory of markdown files.

### Vault Directory Structure

```
vault/
├── campaign/
│   ├── npcs/
│   │   ├── barthen.md
│   │   └── sildar.md
│   └── locations/
│       └── phandalin.md
├── sessions/
│   ├── session-01.md
│   └── session-02.md
└── .vault/
    └── index.json          # Cached metadata index (link graph, tag counts)
```

### File Format

Each note is a standard markdown file with YAML frontmatter:

```markdown
---
id: "abc123def456"
title: "Barthen's Provisions"
tags: [npc, phandalin, merchant]
createdAt: "2025-01-15T10:30:00Z"
updatedAt: "2025-01-20T14:22:00Z"
deleted: false
---

# Barthen's Provisions

Barthen is the owner of the general store in [[Phandalin]].
```

### Mapping Rules

| StorageAdapter method | FileSystem operation                                    |
| --------------------- | ------------------------------------------------------- |
| `getNote(id)`         | Read file, parse frontmatter, return Note object        |
| `saveNote(note)`      | Write frontmatter + content to file                     |
| `deleteNote(id)`      | Set `deleted: true` in frontmatter (soft delete)        |
| `deleteNote(id, true)`| Remove file from disk (permanent delete)                |
| `getNotesByFolder(f)` | List files in the corresponding directory               |
| `resolveTitle(title)` | Look up title in the cached metadata index              |
| `getLinksFrom(id)`    | Parse note content for `[[wikilinks]]`                  |
| `getLinksTo(id)`      | Query the cached link graph index                       |

### Metadata Index

The `.vault/index.json` cache stores derived data (link graph, tag counts, title-to-ID mappings) to avoid reparsing every file on startup. It is rebuilt automatically if missing or stale.

### Compatibility

- Files are standard markdown with YAML frontmatter — compatible with Obsidian, Logseq, and other markdown tools
- The `id` field in frontmatter is the only DND Tools-specific addition; other tools ignore it
- Wikilink syntax (`[[note-name]]`) matches the Obsidian convention
- The web app's import/export feature reads and writes this same format

---

## Future: Cloud Sync Architecture

When cloud sync is added, the architecture will extend (not replace) the local storage:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Local Store   │ ←→  │ Sync Engine  │ ←→  │ Cloud API    │
│ (IndexedDB)   │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Sync strategy**: CRDTs (Conflict-free Replicated Data Types) or OT (Operational Transform) for conflict resolution. The local store remains the source of truth for the UI — cloud sync happens in the background.

**Conflict resolution priority**:
1. Most recent write wins (for simple fields like title, folder)
2. Operational merge (for content — merge concurrent edits at the character level)
3. User prompt (for irreconcilable conflicts — show diff and let user choose)
