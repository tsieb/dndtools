# Architecture

This document describes the system architecture for DND Tools — a lightweight, local-first web application for organizing D&D campaign notes with Obsidian-style markdown and bidirectional linking.

---

## Design Principles

1. **Local-first**: Data lives on the user's device. The app works fully offline. Network is an enhancement layer added later.
2. **Lightweight**: Minimal bundle, fast load, low memory footprint. Must perform on tablets, budget laptops, and older phones.
3. **Composable**: Small, focused modules that compose together. No monolithic components.
4. **Extensible**: Architecture supports adding maps, shared notes, player features, and cloud sync without rewriting core systems.
5. **Data-portable**: Notes are standard markdown. Users can export their entire vault at any time.

---

## High-Level Architecture

The system has two access paths — the **web application** (browser) and the **MCP server** (Node.js) — that share a common service and storage core.

```
┌───────────────────────────────────┐  ┌───────────────────────────┐
│       Web Application (Browser)   │  │    MCP Server (Node.js)   │
│                                   │  │                           │
│  ┌──────────────────────────────┐ │  │  ┌───────────────────┐    │
│  │          UI Layer            │ │  │  │  MCP Protocol     │    │
│  │  Editor, Viewer, Search, Nav │ │  │  │  Handler          │    │
│  └──────────────┬───────────────┘ │  │  └─────────┬─────────┘    │
│                 │                  │  │            │              │
│  ┌──────────────┴───────────────┐ │  │            │              │
│  │        State Layer           │ │  │            │              │
│  │  Svelte Stores (notes,       │ │  │            │              │
│  │  editor, search, ui)         │ │  │            │              │
│  └──────────────┬───────────────┘ │  │            │              │
│                 │                  │  │            │              │
├─────────────────┴──────────────────┤  │            │              │
│                                    │  │            │              │
│         Shared Core ($lib/)        │◄─┼────────────┘              │
│                                    │  │                           │
│  ┌────────────┐ ┌───────┐ ┌─────┐ │  │                           │
│  │ Markdown   │ │ Link  │ │Srch │ │  │                           │
│  │ Pipeline   │ │ Graph │ │ Eng │ │  │                           │
│  └──────┬─────┘ └───┬───┘ └──┬──┘ │  │                           │
│         │           │        │     │  │                           │
├─────────┴───────────┴────────┴─────┤  │                           │
│       Storage Abstraction          │◄─┘                           │
│  ┌──────────────┐ ┌─────────────┐  │                              │
│  │ IndexedDB    │ │ FileSystem  │  │                              │
│  │ Adapter      │ │ Adapter     │  │                              │
│  │ (browser)    │ │ (Node.js)   │  │                              │
│  └──────────────┘ └─────────────┘  │                              │
│                   ┌─────────────┐  │                              │
│                   │ Cloud       │  │                              │
│                   │ Adapter     │  │                              │
│                   │ (future)    │  │                              │
│                   └─────────────┘  │                              │
└────────────────────────────────────┘  └───────────────────────────┘
```

**Key insight**: The Service Layer and Storage Layer are **isomorphic** — they work in both browser and Node.js environments. The UI/State layers are browser-only. The MCP Protocol Handler is Node.js-only. This keeps the shared core reusable across access paths.

---

## Layer Responsibilities

### UI Layer (`src/routes/`, `src/lib/components/`)

The presentation layer. Svelte components that render state and dispatch user actions.

**Rules**:
- Components are purely presentational or thin orchestrators
- No direct storage access — always go through stores
- No business logic beyond simple display transforms
- Components communicate via props (down) and events (up)
- Co-located with route-level pages via SvelteKit's file-based routing

**Key component groups**:

| Group          | Location                      | Responsibility                       |
| -------------- | ----------------------------- | ------------------------------------ |
| Editor         | `components/editor/`          | CodeMirror-based markdown editor     |
| Viewer         | `components/viewer/`          | Rendered markdown display            |
| Navigation     | `components/nav/`             | Sidebar, breadcrumbs, vault tree     |
| Search         | `components/search/`          | Search input, results, filters       |
| Common         | `components/common/`          | Buttons, modals, tooltips, etc.      |
| Layout         | `components/layout/`          | Page shells, split panes, responsive |

### State Layer (`src/lib/stores/`)

Svelte stores manage all application state. They sit between the UI and service/storage layers.

**Rules**:
- Each store owns a single domain of state
- Stores can depend on other stores via `derived`
- Async operations (loading, saving) are handled inside stores
- Stores expose a clean, minimal API — internal state shape is private
- Error and loading states are part of the store's contract

**Key stores**:

| Store          | Responsibility                                          |
| -------------- | ------------------------------------------------------- |
| `notes`        | CRUD operations on notes, caching, active note tracking |
| `editor`       | Editor state: content buffer, dirty flag, cursor pos    |
| `search`       | Search query, results, filter state                     |
| `links`        | Link graph: forward links, backlinks, orphan detection  |
| `ui`           | Sidebar visibility, theme, layout preferences           |
| `vault`        | Vault metadata: folder structure, tags, note count      |

### Service Layer (`src/lib/markdown/`, `src/lib/services/`)

Stateless services that implement business logic. These are pure functions and processing pipelines.

**Markdown Pipeline** (`src/lib/markdown/`):
```
Raw Markdown (string)
  │
  ▼
┌──────────────┐
│ remark-parse │  Parse markdown to mdast (markdown AST)
└──────┬───────┘
       │
  ▼ Remark Plugins
┌──────────────────────┐
│ custom wikilink plugin│ Parse [[wikilinks]] into link nodes
│ remark-frontmatter   │  Extract YAML frontmatter metadata
│ remark-gfm           │  GitHub-flavored markdown (tables, etc.)
└──────┬───────────────┘
       │
  ▼ Transform
┌──────────────┐
│ remark-rehype│  Convert mdast → hast (HTML AST)
└──────┬───────┘
       │
  ▼ Rehype Plugins
┌──────────────────────┐
│ rehype-slug          │  Add IDs to headings
│ rehype-highlight     │  Syntax highlighting for code blocks
│ rehype-sanitize      │  Sanitize HTML to prevent XSS
└──────┬───────────────┘
       │
  ▼ Serialize
┌──────────────┐
│ rehype-stringify │  Convert hast → HTML string
└──────────────┘
       │
  ▼
Rendered HTML (string)
```

**Link Graph Service** (`src/lib/services/link-graph.ts`):
- Maintains an in-memory graph of all note links
- Rebuilds incrementally when notes change
- Provides: forward links, backlinks, orphan notes, graph data for visualization
- Graph structure: adjacency list using `Map<noteId, Set<noteId>>`

**Search Service** (`src/lib/services/search.ts`):
- Client-side full-text search using a lightweight index (e.g., MiniSearch)
- Indexes note titles, content, tags, and frontmatter
- Supports fuzzy matching and ranked results
- Index is rebuilt on startup and updated incrementally

### MCP Server (`mcp/`)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that enables AI agents and LLM-powered dev tools (Claude Code, Cursor, Windsurf, etc.) to read, create, edit, search, and link notes programmatically.

**Purpose**: Provide structured tool access to the note vault so AI assistants can help with campaign planning, note organization, content generation, and cross-referencing — without requiring the web UI.

**Architecture**:
- Runs as a separate Node.js process alongside the web app
- Communicates via the MCP protocol (stdio or SSE transport)
- Uses the same `StorageAdapter` interface as the web app
- Imports shared code from the Service Layer (`$lib/markdown/`, `$lib/services/`)
- Default storage: `FileSystemAdapter` operating on markdown files in a vault directory

**MCP Tools exposed**:

| Tool              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `list_notes`      | List notes with optional folder/tag/date filters     |
| `read_note`       | Read a note by title or ID                           |
| `create_note`     | Create a note with title, content, folder, tags      |
| `update_note`     | Update a note's content or metadata                  |
| `delete_note`     | Soft-delete a note (recoverable)                     |
| `search_notes`    | Full-text search across all notes                    |
| `get_backlinks`   | Get all notes that link to a given note              |
| `get_tags`        | List all tags with usage counts                      |

**MCP Resources exposed**:

| Resource URI            | Description                          |
| ----------------------- | ------------------------------------ |
| `note://{id}`           | Individual note content and metadata |
| `vault://structure`     | Vault folder tree and note counts    |
| `vault://tags`          | Complete tag index                   |

**Rules**:
- MCP tools use the same `StorageAdapter` interface — never bypass it
- All writes go through the markdown pipeline for link extraction and indexing
- The MCP server must not depend on browser-only APIs
- Tool responses use structured data (JSON); note content is raw markdown

### Storage Layer (`src/lib/storage/`)

All persistence is abstracted behind a `StorageAdapter` interface. This is the single most important architectural boundary — it enables migration from local to cloud storage without changing any other layer.

The canonical `StorageAdapter` contract is defined in `docs/DATA_MODEL.md` under "Storage Abstraction". Architecture guidance must reference that contract rather than redefining it here.

**Local adapter** (`IndexedDBAdapter`):
- Used by the web application (browser)
- Uses Dexie.js for ergonomic IndexedDB access
- Schema versioning with automatic migrations
- Indexes on: `id`, `title`, `folder`, `updatedAt`, `tags`

**File system adapter** (`FileSystemAdapter`):
- Used by the MCP server (Node.js)
- Reads and writes standard markdown files in a vault directory on disk
- Folder structure maps directly to the filesystem
- Frontmatter is the source of truth for metadata (tags, title, dates)
- Compatible with Obsidian — vault directory is a valid Obsidian vault
- Watches for external file changes via `chokidar` and re-indexes incrementally

**Future cloud adapter** (`CloudAdapter`):
- Will implement the same `StorageAdapter` interface
- Sync engine will handle: queue, retry, conflict resolution, offline fallback
- UI code will not change — only the adapter is swapped

---

## Data Flow Examples

### Opening a Note

```
User clicks note link
  → Router navigates to /notes/:id
  → +page.ts load function calls notes store
  → Notes store checks cache, then calls StorageAdapter.getNote()
  → IndexedDB returns Note object
  → Notes store updates active note
  → Viewer component receives note via store subscription
  → Markdown pipeline processes note.content → HTML
  → Viewer renders HTML
  → Link graph service extracts links, updates backlinks
```

### Saving a Note (Auto-Save)

```
User edits in CodeMirror
  → Editor dispatches content change event
  → Editor store updates content buffer, sets dirty flag
  → Debounced save (500ms) triggers
  → Notes store calls StorageAdapter.saveNote()
  → IndexedDB persists the note
  → Notes store updates cache, clears dirty flag
  → Link graph service re-indexes links for this note
  → Search service re-indexes this note
```

### Searching Notes

```
User types in search bar
  → Search store updates query (debounced 200ms)
  → Search service queries MiniSearch index
  → Results returned with relevance scores
  → Search store updates results
  → Search component renders ranked results with highlighted matches
```

### AI Agent Creates a Note (via MCP)

```
AI agent calls MCP tool: create_note
  → MCP server validates input (title, content, folder, tags)
  → FileSystemAdapter writes markdown file to vault directory
  → Frontmatter is generated from metadata (tags, title, dates)
  → Markdown pipeline parses content for wikilinks
  → Link graph service indexes extracted links
  → Search service indexes the new note
  → MCP server returns note ID and confirmation
```

### Data Sharing: Web App ↔ MCP Server

```
Both access paths operate on the same vault data:

  Option A — Shared vault directory (default):
    Web app imports from / exports to the vault directory
    MCP server reads/writes the vault directory directly
    File watcher detects external changes for re-indexing

  Option B — Shared local API (future):
    Companion server exposes StorageAdapter as HTTP API
    Both web app and MCP server connect to the same API
    Enables real-time sync between access paths
```

---

## Routing Structure

SvelteKit file-based routing:

```
src/routes/
├── +layout.svelte          # Root layout (sidebar + main area)
├── +page.svelte            # Home / dashboard
├── notes/
│   ├── +page.svelte        # All notes list
│   └── [id]/
│       ├── +page.svelte    # Note viewer
│       └── edit/
│           └── +page.svelte # Note editor
├── search/
│   └── +page.svelte        # Search results page
├── graph/
│   └── +page.svelte        # Graph view (lazy loaded)
├── settings/
│   └── +page.svelte        # User preferences
└── vault/
    └── +page.svelte        # Vault management (import/export)
```

---

## Code Splitting & Lazy Loading

To maintain the < 100KB initial bundle target:

| Chunk                | Load Strategy  | Rationale                                       |
| -------------------- | -------------- | ----------------------------------------------- |
| Core shell + routing | Eager          | Required for every page                         |
| Note viewer          | Eager          | Most common interaction                         |
| Note editor          | Lazy (route)   | Only needed when editing                        |
| Graph view           | Lazy (route)   | Heavy (D3/canvas), rarely used                  |
| Search index         | Lazy (idle)    | Build during idle time after initial load        |
| Settings             | Lazy (route)   | Rarely accessed                                 |
| Import/Export        | Lazy (action)  | Only on explicit user action                    |

Use SvelteKit's built-in code splitting (automatic per route) and dynamic `import()` for component-level splits.

---

## Error Handling Strategy

### Error Boundaries
- Each major UI section has an error boundary (`<svelte:boundary>`)
- Errors in one section (e.g., editor) don't crash the sidebar or navigation
- Error boundaries show a user-friendly message with a "retry" action

### Storage Errors
- All storage operations return `Promise` and may throw
- Stores catch errors and expose them as part of their state (`{ data, error, loading }`)
- Failed saves trigger a visible "unsaved changes" indicator and retry logic
- IndexedDB quota errors prompt the user to free space or export data

### Graceful Degradation
- If the markdown pipeline fails on a note, display raw markdown instead of crashing
- If the search index fails to build, disable search UI with a message
- If IndexedDB is unavailable (private browsing in some browsers), fall back to in-memory with a warning

---

## Security Considerations

Even as a local-first app, security matters:

1. **XSS Prevention**: All markdown-to-HTML goes through `rehype-sanitize`. User content is never rendered via `{@html}` without sanitization.
2. **No eval**: Never use `eval()`, `Function()`, or `innerHTML` with unsanitized content.
3. **Content Security Policy**: Set appropriate CSP headers to prevent inline script injection.
4. **Future auth**: When cloud sync is added, authentication will use industry-standard OAuth 2.0 / OIDC. No custom auth schemes.
5. **Data export**: Users can always export all their data in standard markdown format.

---

## Future Extension Points

The architecture is designed to accommodate future features without structural changes:

| Future Feature    | Extension Point                                               |
| ----------------- | ------------------------------------------------------------- |
| Cloud sync        | New `CloudAdapter` implementing `StorageAdapter`              |
| Shared notes      | Permissions layer on top of storage adapter                   |
| Maps              | New route + lazy-loaded map component                         |
| Player features   | New routes + role-based UI gating in layout                   |
| Real-time collab  | CRDT layer between editor store and storage adapter           |
| Plugins           | Plugin API hooks in markdown pipeline + component slots       |
| Mobile app        | SvelteKit adapter swap (static → Capacitor/Tauri)             |
| MCP tool expansion| New tools/resources registered in the MCP server              |
| Multi-agent       | MCP server supports concurrent tool calls with locking        |
