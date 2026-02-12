# Development Roadmap

This document outlines the phased development plan for DND Tools, from initial MVP through full-featured platform.

---

## Phase 0: Project Scaffolding

**Goal**: Set up the development environment, tooling, and project structure.

**Deliverables**:
- [ ] Initialize SvelteKit project with TypeScript
- [ ] Configure Tailwind CSS v4
- [ ] Configure ESLint (flat config) + Prettier
- [ ] Configure Vitest + Playwright
- [ ] Set up Husky + lint-staged for pre-commit hooks
- [ ] Configure `$lib/` path aliases and TypeScript strict mode
- [ ] Create initial folder structure (`components/`, `stores/`, `utils/`, `types/`, etc.)
- [ ] Set up VS Code workspace settings and recommended extensions
- [ ] Create `.gitignore`, `.prettierrc`, `eslint.config.js`
- [ ] Verify build produces a working static SPA
- [ ] Create `mcp/` directory structure with TypeScript config
- [ ] Add `@modelcontextprotocol/sdk` dependency
- [ ] Add `pnpm mcp:dev`, `pnpm mcp:build`, and `pnpm mcp:inspect` scripts

**Exit criteria**: `pnpm dev` starts cleanly, `pnpm build` produces output, `pnpm check` passes with no errors. MCP server skeleton compiles.

---

## Phase 1: Core Note System (MVP)

**Goal**: A working note-taking app with markdown support and basic organization.

### 1.1 Storage Foundation
- [ ] Define TypeScript types for Note, Folder, Link, AppSettings
- [ ] Implement Dexie.js database schema (version 1)
- [ ] Implement `IndexedDBAdapter` with full `StorageAdapter` interface
- [ ] Unit tests for all storage operations

### 1.2 Note CRUD
- [ ] Create note (with auto-generated ID, default title, folder placement)
- [ ] Read note (fetch from storage, render markdown)
- [ ] Update note (edit content, auto-save with debounce)
- [ ] Delete note (soft delete with trash, restore, permanent delete)
- [ ] List notes (sorted by recent, alphabetical)

### 1.3 Markdown Rendering
- [ ] Set up unified/remark/rehype pipeline
- [ ] Configure remark-gfm (tables, task lists, strikethrough)
- [ ] Configure remark-frontmatter (YAML parsing)
- [ ] Configure rehype-sanitize (XSS prevention)
- [ ] Configure rehype-slug (heading anchors)
- [ ] Unit tests for markdown rendering

### 1.4 Basic Editor
- [ ] Integrate CodeMirror 6 with markdown language support
- [ ] Implement auto-save (500ms debounce)
- [ ] Show save status indicator
- [ ] Basic toolbar (bold, italic, heading, link, list, code)
- [ ] Note title editing

### 1.5 Navigation & Layout
- [ ] Root layout with collapsible sidebar
- [ ] Sidebar: vault tree (folder hierarchy)
- [ ] Sidebar: recent notes list
- [ ] Top bar with core actions (new note, search, settings)
- [ ] Responsive layout (mobile sidebar as drawer)
- [ ] Route structure: home, notes list, note view, note edit

### 1.6 Theming
- [ ] Define Tailwind theme tokens (colors, fonts, spacing)
- [ ] Implement light mode (parchment theme)
- [ ] Implement dark mode (tavern theme)
- [ ] Theme toggle with system preference detection
- [ ] Persist theme preference in settings

### 1.7 MCP Server (Agentic Access)
- [ ] Implement `FileSystemAdapter` (reads/writes markdown files in a vault directory)
- [ ] Set up MCP server entry point with stdio transport
- [ ] Implement core MCP tools: `list_notes`, `read_note`, `create_note`, `update_note`, `delete_note`
- [ ] Implement `search_notes` tool (reuses MiniSearch from service layer)
- [ ] Implement `get_backlinks` and `get_tags` tools
- [ ] Expose MCP resources: `note://{id}`, `vault://structure`, `vault://tags`
- [ ] Wire up markdown pipeline for link extraction on note creation/update
- [ ] Unit tests for all MCP tools and FileSystemAdapter
- [ ] Documentation: MCP server setup and configuration guide

**Exit criteria**: Users can create, edit, view, organize, and delete notes. Markdown renders correctly. App works offline. UI is responsive and themed. AI agents can read, create, update, search, and link notes via MCP.

---

## Phase 2: Linking & Knowledge Graph

**Goal**: Transform the app from basic notes into a connected knowledge base with Obsidian-style linking.

### 2.1 Wikilink Parsing
- [ ] Custom remark plugin for `[[wikilink]]` syntax
- [ ] Support display aliases: `[[Note Title|Display Text]]`
- [ ] Wikilinks rendered as clickable navigation links in view mode
- [ ] Unresolved links styled distinctly (dashed, muted)
- [ ] Clicking unresolved link prompts note creation

### 2.2 Backlinks
- [ ] Link extraction on note save (parse all `[[wikilinks]]`)
- [ ] Store links in IndexedDB links table
- [ ] Backlinks panel at bottom of note view
- [ ] Show context snippet for each backlink
- [ ] Update backlinks incrementally on note changes

### 2.3 Wikilink Autocomplete
- [ ] CodeMirror extension: detect `[[` trigger
- [ ] Dropdown with fuzzy-matched note titles
- [ ] Keyboard navigation (arrow keys, Enter to select)
- [ ] "Create new note" option when no match

### 2.4 Link Graph Service
- [ ] Build in-memory adjacency graph from links table
- [ ] Incremental updates when notes/links change
- [ ] API: get forward links, backlinks, orphan notes, all connections
- [ ] Unit tests for graph operations

### 2.5 Tag System
- [ ] Parse tags from frontmatter and inline `#tag` syntax
- [ ] Tag index: count notes per tag
- [ ] Sidebar section: tag list with counts
- [ ] Filter notes by tag
- [ ] Tag autocomplete in editor

**Exit criteria**: Notes can link to each other. Backlinks are visible. Link graph is maintained. Tags are functional.

---

## Phase 3: Search & Discovery

**Goal**: Enable users to quickly find any note in their vault.

### 3.1 Full-Text Search
- [ ] Integrate MiniSearch
- [ ] Index: title (boost 3x), tags (boost 2x), content (1x)
- [ ] Fuzzy matching with typo tolerance
- [ ] Search results page with highlighted snippets
- [ ] Debounced search input (200ms)

### 3.2 Quick Switcher
- [ ] Command palette UI (Ctrl+P)
- [ ] Fuzzy search on note titles
- [ ] Recent notes shown by default
- [ ] Keyboard navigation
- [ ] Opens in < 100ms

### 3.3 Advanced Filtering
- [ ] Filter by folder
- [ ] Filter by tag (multi-select)
- [ ] Sort by: title, date modified, date created
- [ ] Filter by date range
- [ ] Combined filters (folder + tag + text)

### 3.4 Graph Visualization
- [ ] Lazy-loaded graph view page
- [ ] Force-directed graph layout (lightweight library)
- [ ] Nodes = notes, edges = links
- [ ] Click node to navigate to note
- [ ] Highlight current note and its connections
- [ ] Zoom and pan controls
- [ ] Node sizing by connection count

**Exit criteria**: Users can find any note quickly via search, quick switcher, or graph view. Filters narrow large vaults effectively.

---

## Phase 4: Polish & Advanced Features

**Goal**: Refine the user experience and add power-user features.

### 4.1 Import / Export
- [ ] Export vault to zip of markdown files
- [ ] Import individual markdown files
- [ ] Import zip of markdown files (with folder structure)
- [ ] Obsidian vault compatibility (direct import)
- [ ] Progress indicator for bulk operations
- [ ] Duplicate detection on import

### 4.2 Folder Management
- [ ] Create, rename, delete folders
- [ ] Drag-and-drop notes between folders
- [ ] Nested folders (up to 3 levels)
- [ ] Folder context menu (right-click)

### 4.3 Editor Enhancements
- [ ] Live preview decorations (render links and images inline while editing)
- [ ] Syntax highlighting for code blocks
- [ ] Find and replace within a note
- [ ] Vim keybindings (optional, toggled in settings)
- [ ] Word count and reading time display
- [ ] Undo/redo with visual indicators

### 4.4 Note Enhancements
- [ ] Note pinning (pinned notes appear at top of lists)
- [ ] Note templates (pre-filled content for NPCs, locations, sessions, etc.)
- [ ] Custom callout blocks (styled blockquotes for DM notes, player info, etc.)
- [ ] Table of contents auto-generated from headings
- [ ] Print-friendly view / PDF export

### 4.5 Settings & Preferences
- [ ] Settings page with organized sections
- [ ] Editor preferences (font size, line height, word wrap, vim mode)
- [ ] Appearance preferences (theme, sidebar width)
- [ ] Data management (export, import, clear data, storage usage)
- [ ] Keyboard shortcut reference

### 4.6 Performance Optimization
- [ ] Virtual scrolling for long note lists
- [ ] Search index built during idle time
- [ ] Image lazy loading
- [ ] Service worker for offline caching
- [ ] Bundle size audit and optimization
- [ ] Lighthouse CI integration

### 4.7 Accessibility Audit
- [ ] Full WCAG 2.1 AA compliance audit
- [ ] Screen reader testing (NVDA, VoiceOver)
- [ ] Keyboard navigation audit
- [ ] Color contrast verification
- [ ] Focus management review
- [ ] Motion preference compliance

**Exit criteria**: The app is polished, accessible, performant, and feature-rich for single-user local usage.

---

## Phase 5: Cloud & Sharing (Future)

**Goal**: Enable cloud storage, sync across devices, and shared access.

### 5.1 Authentication
- [ ] OAuth 2.0 / OIDC integration (Google, GitHub, Discord)
- [ ] Session management
- [ ] Account settings page

### 5.2 Cloud Storage
- [ ] Cloud storage adapter (implements `StorageAdapter` interface)
- [ ] API backend (candidates: Supabase, Firebase, custom)
- [ ] Data encryption at rest and in transit

### 5.3 Sync Engine
- [ ] Bidirectional sync between local and cloud
- [ ] Offline queue for changes made without network
- [ ] Conflict detection and resolution
- [ ] Sync status indicator in UI
- [ ] Manual sync trigger and auto-sync on reconnection

### 5.4 Shared Vaults
- [ ] Vault sharing via invite link
- [ ] Role-based access: Owner, Editor, Viewer
- [ ] Per-note sharing permissions
- [ ] Shared note indicator in UI

### 5.5 Real-time Collaboration
- [ ] Live cursors in shared notes
- [ ] CRDT-based concurrent editing
- [ ] Presence indicators (who's viewing/editing)

---

## Phase 6: D&D-Specific Tools (Future)

**Goal**: Expand beyond notes into a comprehensive D&D session management platform.

### 6.1 Interactive Maps
- [ ] Map upload and display (image-based initially)
- [ ] Clickable map pins linked to notes
- [ ] Fog of war for player-facing maps
- [ ] Map layers (DM layer, player layer)

### 6.2 Player Features
- [ ] Player invitations to campaigns
- [ ] Player-specific note sections (private to each player)
- [ ] Character sheet integration or linking
- [ ] Initiative tracker
- [ ] Shared session view (DM controls what players see)

### 6.3 Campaign Management
- [ ] Campaign dashboard (overview of sessions, NPCs, quests)
- [ ] Session planning tools (agenda, encounter prep)
- [ ] Quest tracker with status progression
- [ ] NPC relationship graph
- [ ] Timeline / calendar for campaign events

### 6.4 Reference Tools
- [ ] SRD (System Reference Document) integration
- [ ] Spell lookup
- [ ] Monster stat blocks
- [ ] Item reference
- [ ] Rules quick reference

---

## Priority & Sequencing

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
  (setup)    (MVP)       (linking)   (search)    (polish)
                                                    │
                                                    ▼
                                                Phase 5 ──→ Phase 6
                                                (cloud)     (D&D tools)
```

- Phases 0-4 are sequential prerequisites
- Phase 5 and 6 can be parallelized once Phase 4 is stable
- Within each phase, sub-tasks can be parallelized where independent

---

## Success Metrics

| Metric                          | Target                  | Measured by              |
| ------------------------------- | ----------------------- | ------------------------ |
| Initial load time (3G)          | < 2 seconds             | Lighthouse               |
| JS bundle (initial, gzipped)    | < 100KB                 | Build output             |
| Time to create a new note       | < 1 second              | Manual testing           |
| Search response time            | < 200ms                 | Performance profiling    |
| Lighthouse Performance score    | ≥ 90                    | Lighthouse CI            |
| Lighthouse Accessibility score  | ≥ 95                    | Lighthouse CI            |
| Zero data loss incidents        | 0                       | User reports / testing   |
| Works fully offline             | Yes                     | E2E test in offline mode |
| MCP tool response time          | < 500ms                 | Integration tests        |
| MCP tools functional            | All 8 core tools        | MCP test suite           |
