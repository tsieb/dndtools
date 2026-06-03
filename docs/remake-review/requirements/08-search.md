## SRCH - Search and Discovery

Capability tree:

- Local indexes and freshness: `SRCH-001`, `SRCH-009`
- Quick switcher and command discovery: `SRCH-002`
- Filters and saved searches: `SRCH-003`, `SRCH-004`
- Ranking and result context: `SRCH-005`, `SRCH-006`, `SRCH-011`
- Result opening and deterministic diagnostics: `SRCH-007`, `SRCH-008`
- Calendar/custom-time discovery: `SRCH-010`

### SRCH-001
**Statement:** A user shall be able to perform full-text search over visible notes, objects, maps, POIs, handouts, and session artifacts from cached local indexes.
**Source:** Project Overview search; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the app is offline, when the user searches cached content, then visible results return from local indexes.
- Given a player searches for a term present only in DM-only content, when results are returned, then no hidden result or snippet appears.
- Given a note, object, map artifact, or session record changes, when the mutation is accepted, then affected search indexes update incrementally or mark stale status before returning results.

### SRCH-002
**Statement:** A user shall be able to use quick switcher search for title-first navigation across visible content and commands.
**Source:** UX Guidelines Search; Feature Inventory I13 command palette.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note title matches the query, when the quick switcher opens, then title matches rank above body-only matches.
- Given query changes, when Enter is pressed, then the current selection is executed and stale selection state is not used.
- Given a player opens quick switcher search, when DM-only commands, hidden entity targets, or hidden command labels would match, then those commands, labels, ids, and revealing counts are absent.

### SRCH-003
**Statement:** A user shall be able to filter search by source, content type, tag, folder, date, visibility-safe relationship, and saved search definition.
**Source:** Feature Inventory I3 advanced search; UX Guidelines.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a saved search filters map POIs by tag, when opened, then only visible matching POIs appear.
- Given a source is unavailable, when a saved search references it, then cached results are marked stale or unavailable without failing the whole search.
- Given the user combines source, folder, tag, content type, date range, and relationship filters, when search runs, then all facets are applied together and the result metadata lists the active filters.
- Given a relationship filter would match hidden related content, when a player searches, then hidden relationships do not appear as results, facets, hints, or revealing counts.

### SRCH-004
**Statement:** The DM shall be able to create, edit, pin, and delete saved searches for recurring campaign workflows without exposing hidden criteria to players.
**Source:** Feature Inventory I3 saved searches; Navigation carry-forward.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM pins a saved search to the Command Center, when the Command Center loads, then the saved search widget shows current results.
- Given a saved search includes DM-only criteria, when a player views shared navigation, then the saved search is absent unless explicitly visible.

### SRCH-005
**Statement:** The Search Engine shall rank results using deterministic recency, title, tag, link, entity-type, and session-context signals before optional AI assistance is applied.
**Source:** Vision "Algorithms are primary"; Feature Inventory I5 semantic search.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given AI is disabled, when search runs, then ranking still uses deterministic scoring.
- Given session context indicates an active map, when searching POIs, then visible POIs on that map rank higher than unrelated POIs.
- Given two results have equivalent score inputs, when ranked, then deterministic tie-breakers produce stable order across repeated runs and fresh fixtures.
- Given optional AI assistance is enabled, when results are shown, then AI explanation or reranking cannot expose hidden content or replace deterministic base ranking without a visible label.

### SRCH-006
**Statement:** The Search Engine shall expose enough context in results for fast disambiguation, including title, source, type, visible snippet, tags, and relationship hints.
**Source:** UX Guidelines Search; Feature Inventory I3.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given two notes have similar names, when search returns both, then each result includes source/type context and visible snippet.
- Given a snippet crosses a hidden section boundary, when returned to a player, then hidden text is omitted.
- Given a result has visible backlinks, date references, folder path, or map/Scene context, when result context renders, then those relationship hints are included only if visible to the actor.

### SRCH-007
**Statement:** A user shall be able to open search results into the correct route, Scene, map viewport, note heading, or object view while preserving browser history and search parameters.
**Source:** Defect `CODEX-PR13-MAP-REDIRECT-PARAMS`; Feature Inventory I13.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a search result links to a POI with `x`, `y`, and `poi` parameters, when opened, then the map viewport focuses the POI and preserves parameters through redirects.
- Given a note heading result opens, when navigation completes, then hash navigation and scroll semantics are preserved.

### SRCH-008
**Statement:** Search indexes shall normalize unstable IDs and source-specific metadata so test artifacts, saved searches, and diagnostics remain deterministic across fresh vault fixtures.
**Source:** Defects `CODEX-PR12-AXE-FINGERPRINTS`, `AUDIT-21.4-FEATURE-TIER-E2E`.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a fresh fixture vault is generated twice, when search diagnostics are produced, then volatile IDs do not create unrelated fingerprint churn.
- Given a saved search is exported/imported, when it runs in the new vault, then stable criteria are preserved or explicit remapping diagnostics appear.

### SRCH-009
**Statement:** The Search Engine shall publish index freshness, source cursor, and partial-result status for each searchable domain without blocking visible cached results.
**Source:** Architecture Contract 2 Local-First Invariant; Performance requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given background indexing is incomplete, when search returns cached visible results, then stale or partial status is exposed with affected sources.
- Given a source cursor advances after sync, when indexing completes, then freshness metadata reflects the new cursor.

### SRCH-010
**Statement:** A user shall be able to search and filter visible content by campaign calendar dates, custom-time ranges, timeline events, and session chronology.
**Source:** Feature Inventory I3 custom world calendar; Session requirements.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a visible event has a custom date, when the user filters by that date range, then the event appears with stable date formatting.
- Given hidden events fall in the same range, when a player searches the range, then hidden events and counts that reveal them are omitted or generalized.

### SRCH-011
**Statement:** Semantic search and entity expansion shall remain optional, visibility-filtered, source-cited, and secondary to deterministic search until a search architecture decision promotes them.
**Source:** Feature Inventory I5 semantic search; Vision "Algorithms are primary"; Open Gaps.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given semantic search is disabled or unavailable, when the user searches, then deterministic full-text, facet, title, tag, graph, and date search still works.
- Given semantic/entity expansion is enabled, when it suggests related entities, then every suggestion has visible source citations and cannot introduce hidden titles, snippets, ids, or revealing counts.
- Given a semantic model is unavailable offline, when search runs, then semantic expansion is marked unavailable and deterministic cached results are still returned.
- Given semantic ranking changes result order, when displayed, then the UI labels the semantic contribution and preserves deterministic score diagnostics for debugging.
