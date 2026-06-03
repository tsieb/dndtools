## GRAPH - Link Graph and Relationship Intelligence

Capability tree:

- Source indexing: `GRAPH-001`, `GRAPH-008`
- Backlinks and navigation relationships: `GRAPH-002`
- Deterministic quality intelligence: `GRAPH-003`, `GRAPH-007`, `GRAPH-009`, `GRAPH-010`
- Visualization: `GRAPH-004`
- Incremental APIs: `GRAPH-005`, `GRAPH-006`

### GRAPH-001
**Statement:** The Graph Engine shall index wikilinks, markdown links, object relationships, note-to-POI links, embeds, and source metadata across all configured sync sources.
**Source:** Glossary "Graph Engine"; Vision Primary Content Sources.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given local, Obsidian, and Google Docs notes are cached, when graph indexing runs offline, then cached relationships are queryable.
- Given a player queries the graph, when hidden nodes exist, then those nodes and edges are omitted.
- Given a configured source is not cached and the app is offline, when indexing runs, then cached graph data is marked partial without blocking visible cached relationships.

### GRAPH-002
**Statement:** A user shall be able to inspect backlinks, cross-section links, and related-note jumps from visible content with snippets redacted according to visibility.
**Source:** Feature Inventory I3 and I13.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a visible note has three backlinks, when the user opens backlinks, then visible backlinks and context snippets appear.
- Given a backlink source is hidden, when a player opens backlinks, then that backlink is absent.

### GRAPH-003
**Statement:** The Graph Engine shall detect unresolved links, aliases, duplicate titles, orphan notes, hub notes, and relationship-quality issues through deterministic algorithms.
**Source:** Feature Inventory I3 graph intelligence; Vision "Algorithms not AI".
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an unresolved wikilink, when graph analysis runs, then it reports a repair candidate without requiring AI.
- Given two notes share an alias, when indexing completes, then disambiguation is surfaced to the DM or editor.
- Given relationship-quality scoring runs, when findings are produced, then each score includes deterministic inputs, threshold version, source references, and no AI-only rationale.

### GRAPH-004
**Statement:** A user shall be able to view a filtered graph visualization by folder, tag, entity type, source, relationship type, and visibility-safe search text.
**Source:** Feature Inventory I3 graph visualization; UX Guidelines.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a graph with notes and maps, when the user filters by `map`, then only visible map nodes and their visible edges are shown.
- Given the graph is opened on mobile, when filters are used, then the graph remains accessible through a simplified control surface.

### GRAPH-005
**Statement:** The Graph Engine shall update incrementally after accepted note, object, map, POI, and sync operations without requiring full-vault reindexing for every change.
**Source:** Feature Inventory I3 incremental graph updates; PERF first-class constraint.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given one note changes, when indexing runs, then only affected graph nodes/edges and dependent indexes update.
- Given an incremental update fails, when diagnostics are raised, then the stale index state is marked and a repair/reindex command is available.

### GRAPH-006
**Statement:** The Graph Engine shall expose source-agnostic query APIs to navigation, search, widgets, and MCP tools without those consumers parsing raw markdown independently.
**Source:** Architecture Contract 1 Processing Core; Feature Inventory I3/I5.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an MCP tool requests backlinks, when the query executes, then it uses the graph API rather than reading files ad hoc.
- Given a widget requests related notes, when the actor is a player, then the graph API returns only visible relationships.

### GRAPH-007
**Statement:** The DM shall be able to run graph health and coverage reports for stale notes, missing links, content gaps, and open threads with deterministic scoring and optional AI explanation.
**Source:** Feature Inventory I5 vault intelligence; Vision AI supplements algorithms.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given AI is disabled, when the DM runs coverage gaps, then deterministic scores and source references are produced.
- Given AI is enabled, when narrative explanation is requested, then the deterministic findings remain the source of truth.
- Given a report includes hidden nodes, when generated for a player-scoped surface, then hidden nodes, snippets, and aggregate counts that would reveal hidden content are omitted or generalized.
- Given no AI runtime is available offline, when health reports run, then deterministic reports still complete.

### GRAPH-008
**Statement:** The Graph Engine shall preserve source-specific identifiers and revision metadata needed to reconcile graph nodes back to local files, Obsidian notes, or Google Docs documents.
**Source:** Architecture Contract 2 Sync Source Contract; Google Drive changes/revisions; Obsidian properties.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a Google Docs note is indexed, when its node is selected, then the graph record includes source id and document id metadata.
- Given an Obsidian note has aliases in properties, when indexed, then aliases resolve without overwriting user-authored frontmatter.
- Given source metadata is unavailable offline, when graph diagnostics open, then cached metadata is shown as stale or partial rather than silently recomputed.

### GRAPH-009
**Statement:** The Graph Engine shall index calendar/custom-time references and expose them to navigation, search, session prep/recap, and MCP bundle tools through the same visibility-filtered graph API.
**Source:** Feature Inventory I3 custom world calendar; Feature Inventory I5 calendar-aware MCP tools.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given session notes, timeline events, and handouts contain custom dates, when graph indexing runs, then visible date relationships are queryable through the graph API.
- Given a player cannot see a calendar-linked event, when they query related events, then the hidden event and its relationship edge are absent.

### GRAPH-010
**Statement:** An authorized editor shall be able to repair dead links, bulk-preview link repairs, and disambiguate link-picker suggestions only within content sections or sources covered by their capability grants, without exposing hidden targets.
**Source:** Feature Inventory I3 graph intelligence; Visibility requirements; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an unresolved wikilink has candidate targets, when the link picker opens for a player, then only visible candidate targets and non-revealing labels appear.
- Given the DM bulk-repairs dead links, when preview opens, then each proposed rewrite, affected source, ambiguity, and unsupported source limitation is listed before writes.
- Given a repair target is ambiguous, when the editor selects one candidate, then only that link changes and graph/search indexes update incrementally.
- Given a hidden note title would be a good repair suggestion, when suggestions are generated for a non-DM actor, then the hidden title, id, and counts are omitted.
- Given a player has `section-editor` on one note section, when they attempt a bulk repair that rewrites another section or source document, then the repair command is rejected before mutation.
