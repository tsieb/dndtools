# Initiative 3 — Core Knowledge Architecture

## Status: COMPLETED

**Outcome:** The vault knowledge model is complete, intelligent, and interoperable. Notes
link to structured objects, the graph is always accurate, search is instant and faceted,
templates reduce repetitive work, and vaults move freely in and out of the app.

**Why third:** This is the core product. Session tools, AI, and collaboration all build
on the knowledge model. It must be solid and feature-complete before those layers add
their demands.

---

## Epic 3.1 — Note & Wikilink Graph Engine

**Goal:** The link graph is always accurate, always incremental, and supports rich
resolution including aliases and disambiguation.

**Stories:**

- **S3.1.1 — Incremental link graph updates**
  Replace full-graph rebuilds triggered by single note mutations with surgical update:
  on note save, compute the diff between old and new links, remove stale edges, and
  insert new edges. Full rebuild is reserved for vault-open and explicit repair. Target:
  single note save does not touch more than O(links in note) graph operations.

- **S3.1.2 — Alias-aware link resolution**
  Allow notes to declare `aliases: [...]` in frontmatter. The link resolver checks
  canonical title first, then aliases. Add alias index to `index.json`. MCP `get_backlinks`
  includes alias-matched links with a flag indicating which alias matched.

- **S3.1.3 — Disambiguated link picker**
  When a `[[Title]]` matches multiple notes (by title or alias), the editor shows an
  inline disambiguation picker rather than silently linking to the first match. The
  picker shows folder context for each candidate. The resolved link uses the note ID
  to remain stable across title changes.

- **S3.1.4 — Dead link highlighting and bulk repair**
  In editor, highlight `[[links]]` that resolve to no note in amber. In reading view,
  show an inline "create note" affordance. Add a Settings → Vault Health report listing
  all unresolved links with their source context and a batch "create all" action.

---

## Epic 3.2 — Structured Object System

**Goal:** Every domain entity (NPC, location, faction, quest, item, encounter, timeline
event) has a typed schema, a structured editor, relationship edges, change history, and
a clean embed protocol for notes.

**Stories:**

- **S3.2.1 — Complete object type coverage with typed schemas**
  Finalize schemas for all 10 object types: stat_block, character, npc, location,
  faction, quest, item, encounter, timeline_event, image. Each type has a Zod schema in
  `mcp/tools/shared/object-schema.ts`, a TypeScript type in `src/lib/types/object.ts`,
  and a structured form component in `src/lib/ui/editor/ObjectStructuredEditor.svelte`.

- **S3.2.2 — Object relationship graph with visualization**
  Extend the relationship model beyond `parent/child/ally/enemy/appears_in_session` to
  include custom relationship labels. Add a relationship graph panel on object notes
  showing connected entities with edge type labels. Clicking a node navigates to that
  object's note.

- **S3.2.3 — Object validation, linting, and fix suggestions**
  Run lint on every object save: required fields, broken relationship targets, cycle
  detection in parent/child chains, and duplicate canonical names. Surface lint issues
  in the structured editor with actionable fix buttons, not just error messages.

- **S3.2.4 — Object change history and revert UI**
  Object mutation history is stored in `.vault/object-history.json`. Add a history panel
  on object notes showing timestamped snapshots with delta summaries. One-click revert
  to any snapshot. Revert creates a new history entry (non-destructive).

- **S3.2.5 — Object embed protocol in notes**
  The `[[obj:id|display]]` embed syntax renders a live mini-card in reading view showing
  key fields from the object type (HP/AC for stat blocks, description for locations, etc.).
  Embedded objects auto-update when the source object changes. The card is keyboard
  accessible and navigable.

---

## Epic 3.3 — Advanced Search & Discovery Engine

**Goal:** Users can find any note or entity in the vault within one interaction, using
rich operators, saved queries, and faceted filters.

**Stories:**

- **S3.3.1 — Advanced query operators**
  Support `tag:monster`, `folder:/locations`, `type:npc`, `updated:>7d`,
  `links:[[NPC Name]]`, and quoted phrase search in the search box. Parse operators
  before routing to MiniSearch. Add a query cheat-sheet accessible from the search bar.

- **S3.3.2 — Faceted filter panel with live counts**
  Add a collapsible filter panel next to search results showing: tag facets with counts,
  folder facets, object type facets, and date range presets. Filters are additive and
  show as removable chips. Counts update in real time as other filters are applied.

- **S3.3.3 — Saved searches and smart collections**
  Allow any search query (including operators) to be saved as a named collection. Saved
  searches appear in the sidebar under "Collections" and update dynamically. Examples:
  "Active NPCs", "Orphaned notes", "Updated this week". Collections are stored in
  `settings.json`.

- **S3.3.4 — Search performance monitoring and budget**
  Instrument search with `performance.mark`/`measure`. Surface P50/P95 latency in
  Settings → System Health. Alert the user in the UI if search falls below budget. Add
  benchmark to the performance regression suite.

- **S3.3.5 — Semantic vector search (opt-in, AI-available)**
  When the MCP sidecar is running and a local embedding model is available (e.g.,
  nomic-embed via Ollama), enable a "semantic search" toggle that supplements keyword
  results with semantically similar notes. This is strictly additive — keyword search
  always works without it.

---

## Epic 3.4 — Template & Snippet Library System

**Goal:** Note and object creation is fast, consistent, and campaign-contextual through
a rich template system with variables and a reusable content library.

**Stories:**

- **S3.4.1 — Global and folder-scoped note templates**
  Templates live in `.vault/templates/`. Each template is a markdown file. Folder-scoped
  templates apply automatically when creating a note inside that folder. The "new note"
  flow shows a template picker if more than one template matches.

- **S3.4.2 — Template variable system**
  Templates support `{{date_iso}}`, `{{date_pretty}}`, `{{campaign_name}}`,
  `{{session_number}}`, `{{character_names_csv}}`, and `{{character_names_bullets}}`.
  Variables are resolved at note creation time from campaign settings. Add a variable
  reference table to the template editor toolbar.

- **S3.4.3 — Snippet / reusable block library**
  Users define named snippets (short reusable text fragments) in `.vault/snippets/`.
  The editor insert menu (`/snippets` or toolbar button) shows the snippet library with
  live preview. Snippets support the same variable syntax as templates.

- **S3.4.4 — "Create from template" everywhere**
  Template creation is available from: command palette, toolbar `+` button, right-click
  in folder tree, and the MCP `create_note` tool (via `templateId` param). The MCP
  tool resolves variables at creation time with context from the tool call parameters.

---

## Epic 3.5 — Import/Export & Interoperability

**Goal:** Vaults move freely between DND Tools, Obsidian, plain markdown, and archive
formats with full validation, preview, and rollback at every step.

**Stories:**

- **S3.5.1 — Obsidian compatibility import pack**
  Map Obsidian frontmatter conventions, folder structure, wikilink syntax, and embed
  syntax to DND Tools equivalents during import. Show a pre-import report identifying
  features that will be mapped, ignored, or require manual resolution. Preserve
  unmapped frontmatter keys in `note.frontmatter`.

- **S3.5.2 — Pre-import analyzer with conflict detection**
  Before any import executes, analyze the incoming content for: duplicate titles, ID
  collisions, invalid frontmatter, encoding issues, missing linked files, and size
  limits. Present a structured report with per-issue severity and "skip / overwrite /
  merge" resolution choices.

- **S3.5.3 — Resumable import for large vaults**
  Large imports (> 500 files) run as a background job with a progress indicator. If the
  import fails midway, the completed files are committed and a resume checkpoint is
  stored. The next import session offers to continue from the checkpoint.

- **S3.5.4 — Portable markdown zip export**
  Add a zip export profile that produces: a folder of plain `.md` files, an `assets/`
  folder for images, and a `README.md` describing the export format. This export is
  usable by any markdown tool. Add export validation (broken embeds, unresolved links)
  and a restore-from-export test.

- **S3.5.5 — Deterministic export for version control**
  Add an export mode that produces a canonical, diff-friendly directory structure
  suitable for git. Frontmatter fields are sorted alphabetically, dates are normalized,
  and IDs are stable. This enables power users to maintain their vault in git.

---

## Epic 3.6 — Vault Graph Intelligence

**Goal:** The vault's link graph is a first-class intelligence surface providing
structural insights, quality metrics, and visual exploration.

**Stories:**

- **S3.6.1 — Orphan detection and hub-note insights**
  Compute orphan notes (no inbound or outbound links) and hub notes (high betweenness
  centrality) as derived metrics updated incrementally on graph mutation. Expose both
  in: Settings → Vault Health, the MCP `get_coverage_gaps` tool, and as sidebar badge
  counts.

- **S3.6.2 — Visual graph exploration with filters**
  The graph view (`/graph`) renders an interactive force-directed graph with: tag-based
  color coding, folder-based clustering, link weight by reference count, and a search
  filter that highlights matching nodes. Clicking a node opens a side panel with note
  preview and quick navigation.

- **S3.6.3 — Backlink context snippets**
  The backlinks panel in note reading view shows the two sentences surrounding each
  backlink occurrence, not just the source note title. The MCP `get_backlinks` response
  includes context snippets as part of its payload. These snippets are pre-indexed at
  write time, not computed on read.

- **S3.6.4 — Link quality report in vault health**
  Add a vault link quality report: total links, broken links, alias-matched links, loops
  (A→B→A), and cross-folder link density. The report is accessible via MCP
  `vault_health_check` and Settings → Vault Health. Each item has a one-click drill-
  down to the affected notes.

---

## Epic 3.7 — In-World Calendar & Custom Time System

**Goal:** DMs can define a fully custom calendar for their world — any number of months,
week lengths, moon phases, and named eras. All timeline events, notes, and session logs
reference dates in this calendar. The system respects that every world is different.

**Stories:**

- **S3.7.1 — Calendar definition schema and editor**
  Add a calendar definition format in `.vault/settings.json` under `worldCalendar`:
  months (name, days), week length and day names, leap year rules, era names and
  epoch offsets, and up to 4 moon cycles (name, period in days, phase names). Add a
  Settings → World → Calendar editor UI. The default calendar is the Gregorian
  calendar so existing timeline events are not broken.

- **S3.7.2 — In-world date type and formatting**
  Add a `WorldDate` value type that stores a day offset from the calendar epoch.
  Add formatting functions for any defined calendar: short (`15 Harvestmoon, Year 312`),
  long, and ISO-equivalent (`0312-09-15`). All date fields on timeline events and
  session notes display in the active calendar format. Dates convert correctly when the
  calendar definition changes.

- **S3.7.3 — Moon phase and calendar reference panel**
  Add a collapsible calendar panel (available as a sidebar widget and board tile) showing:
  current in-world date, this month's calendar grid with event indicators, and moon
  phase status for each defined moon. The DM advances the in-world date manually or
  via a session-start workflow. Current date is stored in `.vault/settings.json`.

- **S3.7.4 — Calendar-aware MCP tools**
  Extend `get_session_prep_bundle` and `get_recap_generation_bundle` to accept
  `worldDate` as a context parameter. Timeline events and session notes reference
  in-world dates in their summaries. Add a `get_calendar_events(dateRange)` MCP tool
  that returns all notes and timeline events within an in-world date range. Document
  the calendar schema in `docs/DATA_MODEL.md`.

---

---
