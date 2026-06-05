# GRAPH-deterministic-quality-intelligence — Completion Evidence

Workpack status: `complete`

Epic: GRAPH-deterministic-quality-intelligence
Requirements: GRAPH-003, GRAPH-007, GRAPH-009, GRAPH-010
Architecture contract: Contract 3 (Role, Visibility & Permission Grant Model).

## Summary

Delivered the DETERMINISTIC quality-intelligence capability branch for GRAPH by COMPOSING the EXISTING
actor-filtered link graph — it introduces NO second relationship/calendar/repair source and embeds NO AI in
any deterministic path. Every surface is a pure Processing-Core read/derivation over already-filtered reads,
so visibility is decided BEFORE any quality signal is computed (Cross-Contract Non-Negotiable 2).

What composes what:

- **GRAPH-003** (graph-quality intelligence) reuses `getContentItemsForActor` (CONTENT-011) for the visible
  note set + `buildWikilinkCandidatesForActor` (CONTENT-006) for the candidate index + `resolveWikilink` for
  link resolution. It derives unresolved links (+ deterministic repair candidates), alias/duplicate-title
  disambiguation, orphan + hub notes, and per-note relationship-quality scores (each carrying deterministic
  inputs + a versioned threshold + source references, no AI).
- **GRAPH-007** (graph health + coverage) builds on the GRAPH-003 report + visible-note staleness signals to
  grade stale notes, missing links, content gaps, open threads, and a 0–100 coverage score. The full report
  is DM-only; a player-scoped summary computes over the actor's visible graph AND generalizes counts. Optional
  AI explanation is a thin labelled layer over the deterministic findings (the findings stay source of truth).
- **GRAPH-009** (calendar/custom-time graph API) reuses `getContentItemsForActor` (date fields + timeline
  refs, with hidden targets already nulled) + `getCalendarContinuityForActor` (SES-012 timeline links) to
  index date references and expose same-date + timeline-reference relationships through the visibility-filtered
  graph API.
- **GRAPH-010** (link repair / picker / bulk preview) reuses the CONTENT-006 wikilink lifecycle
  (`buildWikilinkCandidatesForActor`, `applyLinkRepairForActor`) + the PERM grant model (`hasGrantedCapability`)
  to offer a non-revealing link picker, a capability-scoped bulk-repair preview, and a fail-closed
  single-repair authorization.

Processing/Display decoupling (Contract 1) is preserved: all derivation lives in the Processing Core
(`state/graph-*.ts` pure engines + `queries/graph-*-query.ts` actor-filtered surfaces). No GUI/route/layout
files were touched; the surfaces are exported for the GUI to render the computed models.

## User-visible demo path

These are Processing-Core read surfaces (no new GUI in this epic). A reviewer can exercise them through the
core public API / a unit harness, or via the existing knowledge surface once a GUI consumes them:

1. As the DM, create three player-visible notes: `Highmoor` (`# History`), `Quest Log`
   (`Set out for [[Highmor]] at dawn.` — a typo), and a second `Raven` note (a duplicate title).
2. **GRAPH-003** — `getGraphQualityForActor(content, permissions, dmId)` reports the unresolved `[[Highmor]]`
   with the deterministic repair candidate `Highmoor`, a `duplicate-title` disambiguation group for `Raven`,
   plus orphan/hub/score findings (each score carries inputs + threshold version + source refs, no AI).
3. **GRAPH-007** — `getGraphHealthForDm(content, permissions, dmId, referenceInstant)` grades stale notes,
   missing links, content gaps, open threads, and a 0–100 coverage score; `explainGraphHealth(report)`
   returns a deterministic narrative with NO AI (and degrades to it when an AI explainer is unavailable).
   `getPlayerScopedHealthSummary(...)` returns only generalized count BANDS for a player-scoped surface.
4. **GRAPH-009** — define a campaign calendar, give two player-visible notes the same custom date, and
   `getDateRelationshipsForActor(...)` shows them related by a `same-date` edge with stable date formatting.
   A `dm-only` dated event and its edge are ABSENT for a player.
5. **GRAPH-010** — as a player granted `section-editor` on one note, `getLinkPickerSuggestionsForActor(...)`
   offers only visible candidate titles (never a `dm-only` note), `previewBulkLinkRepairForActor(...)` scopes
   to the granted note only, and `authorizeLinkRepairForActor(...)` REJECTS a repair of another note before
   any mutation while allowing the granted note's repair.

Requirement IDs exercised by the demo: GRAPH-003, GRAPH-007, GRAPH-009, GRAPH-010.

## Requirement coverage / traceability

### GRAPH-003 (story GRAPH-003-S01, tasks T01–T04)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Given an unresolved wikilink, when graph analysis runs, then it reports a repair candidate without requiring AI. | `computeGraphQuality` → `proposeRepairCandidate` (`apps/v2/packages/core/src/state/graph-quality.ts`); `getGraphQualityForActor` (`apps/v2/packages/core/src/queries/graph-quality-query.ts`). | `apps/v2/packages/core/tests/graph-quality-intelligence.test.ts` ("reports an unresolved wikilink with a deterministic repair candidate, no AI"; "proposes NO candidate when nothing visible is close enough"). |
| Given two notes share an alias, when indexing completes, then disambiguation is surfaced to the DM or editor. | `computeDisambiguation` (duplicate-title + alias-collision groups) in `graph-quality.ts`. | same file ("surfaces a DUPLICATE-TITLE group"; "surfaces an ALIAS-COLLISION when an alias shadows another note title"). |
| Given relationship-quality scoring runs, when findings are produced, then each score includes deterministic inputs, threshold version, source references, and no AI-only rationale. | `RelationshipQualityScore` (`inputs` + `thresholdVersion` + `sourceRefs`), `GRAPH_QUALITY_THRESHOLD_VERSION`, `QUALITY_THRESHOLDS` in `graph-quality.ts`. | same file ("each score includes deterministic inputs, the threshold version, and source references" — asserts the exact key set, proving no AI field). |

### GRAPH-007 (story GRAPH-007-S02, tasks T01–T04)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Given AI is disabled, when the DM runs coverage gaps, then deterministic scores and source references are produced. | `computeGraphHealth` + `computeCoverageScore` (`apps/v2/packages/core/src/state/graph-health.ts`); `getGraphHealthForDm` (`apps/v2/packages/core/src/queries/graph-health-query.ts`). | `apps/v2/packages/core/tests/graph-health-coverage.test.ts` ("grades stale notes, missing links, content gaps, open threads, and a coverage score"; "the DM gets the full health report"). |
| Given AI is enabled, when narrative explanation is requested, then the deterministic findings remain the source of truth. | `explainGraphHealth` + `HealthAiExplainer` (annotate-only seam) in `graph-health.ts`. | same file ("an enabled AI annotator may only re-word the deterministic lines, never change findings"). |
| Given a report includes hidden nodes, when generated for a player-scoped surface, then hidden nodes, snippets, and aggregate counts that would reveal hidden content are omitted or generalized. | `getPlayerScopedHealthSummary` (computes over the actor's visible graph; `generalizeCount`/`coverageBand` generalize aggregates) in `graph-health-query.ts`; `getGraphHealthForDm` fails closed for non-DM. | same file ("the player-scoped summary is computed over visible content only and generalizes counts"; "the DM gets the full health report; a non-DM gets the empty report"). |
| Given no AI runtime is available offline, when health reports run, then deterministic reports still complete. | `explainGraphHealth` always produces the deterministic narrative; `ai-unavailable` degrades, never fails. The whole report path needs no AI. | same file ("AI unavailable DEGRADES to the deterministic narrative, never fails"; "produces a DETERMINISTIC narrative with NO AI by default"). |

### GRAPH-009 (story GRAPH-009-S03, tasks T01–T04)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Given session notes, timeline events, and handouts contain custom dates, when graph indexing runs, then visible date relationships are queryable through the graph API. | `buildDateGraphIndex` + `relatedDatesForEntity` (`apps/v2/packages/core/src/state/graph-dates.ts`); `getDateGraphIndexForActor` / `getDateRelationshipsForActor` composing `getContentItemsForActor` + `getCalendarContinuityForActor` (`apps/v2/packages/core/src/queries/graph-dates-query.ts`). | `apps/v2/packages/core/tests/graph-date-relationships.test.ts` ("two visible notes sharing a date are related through the graph API"; pure-engine same-date + timeline-reference edge cases). |
| Given a player cannot see a calendar-linked event, when they query related events, then the hidden event and its relationship edge are absent. | Hidden items omitted by `getContentItemsForActor`; a timeline-link edge is created only when the link resolved `available` (visible); a reference to an absent target yields no edge. | same file ("a player cannot see a dm-only dated event, nor a same-date edge to it"; "querying a hidden event directly returns the generic empty relationships"). |

### GRAPH-010 (story GRAPH-010-S04, tasks T01–T04)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Given an unresolved wikilink has candidate targets, when the link picker opens for a player, then only visible candidate targets and non-revealing labels appear. | `buildLinkPickerSuggestions` (`apps/v2/packages/core/src/state/graph-link-repair.ts`); `getLinkPickerSuggestionsForActor` over `buildWikilinkCandidatesForActor` (`apps/v2/packages/core/src/queries/graph-link-repair-query.ts`). | `apps/v2/packages/core/tests/graph-link-repair.test.ts` ("a player's link picker offers only visible candidate targets, never a dm-only note"; pure-engine picker cases). |
| Given the DM bulk-repairs dead links, when preview opens, then each proposed rewrite, affected source, ambiguity, and unsupported source limitation is listed before writes. | `buildBulkRepairPreview` (`graph-link-repair.ts`); `previewBulkLinkRepairForActor` (`graph-link-repair-query.ts`). | same file ("lists each proposed rewrite, affected source, ambiguity, and unsupported-source limitation"; "the DM bulk preview lists dead links across all visible notes"). |
| Given a repair target is ambiguous, when the editor selects one candidate, then only that link changes and graph/search indexes update incrementally. | `authorizeLinkRepairForActor` computes the rewrite via `applyLinkRepairForActor` and returns the rewritten body for the existing `content.update-item` command (one-link rewrite). | same file ("an authorized editor repairs one chosen link; only that link changes"). |
| Given a hidden note title would be a good repair suggestion, when suggestions are generated for a non-DM actor, then the hidden title, id, and counts are omitted. | Suggestions/preview/candidates are drawn from `buildWikilinkCandidatesForActor` (visible only). | same file ("a player's link picker offers only visible candidate targets, never a dm-only note" — asserts the hidden title is absent). |
| Given a player has `section-editor` on one note section, when they attempt a bulk repair that rewrites another section or source document, then the repair command is rejected before mutation. | `actorCanEditItem` (`hasGrantedCapability` on `content-item` `section-editor`) gates both the preview scope and `authorizeLinkRepairForActor` BEFORE any rewrite. | same file ("a section-editor's preview covers ONLY their granted item"; "REJECTS a section-editor's repair of an item they were not granted, BEFORE mutation"). |

All four stories' tasks T01 (design/interface shape composing the existing graph) → T02 (pure engine +
actor-filtered query) → T03 (unit/integration + determinism + visibility tests) → T04 (demo notes +
traceability, this file) are complete.

## Visibility / data-safety / determinism review

- **No hidden-node/edge leak.** Every surface is fed ONLY actor-visible inputs (`getContentItemsForActor`,
  `buildWikilinkCandidatesForActor`, `getCalendarContinuityForActor`). A hidden note is never a node,
  inbound source, duplicate, hub, orphan, score row, dated node, edge endpoint, picker suggestion, repair
  candidate, or preview row. The player report and the DM report over the same vault differ ONLY by which
  notes are visible.
- **Unresolved link does not betray hidden-vs-missing.** A link to a target the actor cannot see is reported
  `unresolved` with a `null` repair candidate — indistinguishable from a truly-missing target — so a player
  cannot probe a dangling link to learn a DM-only note exists (covered by the GRAPH-003 hidden-vs-missing test).
- **Date-edge fail-closed.** A timeline-link edge is created only when the link resolved `available` (target
  visible); a reference to an absent/hidden target yields no edge (GRAPH-009 AC2).
- **GRAPH-007 is dm-only + generalized.** The full report fails closed for a non-DM (empty report); the
  player-scoped summary computes over the player's visible graph AND generalizes aggregate counts into coarse
  bands, so even a count can never betray hidden content (AC3).
- **GRAPH-010 capability scoping fails closed before mutation.** Write authority (DM, or a `content-item`
  `section-editor` grant) is checked at the data layer before any rewrite; a section-editor on one item can
  never preview or repair another item/source (AC5).
- **Determinism is proven.** Every list has a TOTAL tie-breaker (down to the id). Each requirement has a
  determinism test asserting identical output across fresh fixtures built with a fresh id generator (volatile
  ids differ) AND across repeated runs. No `Date.now`/`Math.random`/ambient state reaches the engines; the
  GRAPH-007 staleness is aged against an EXPLICIT `referenceInstant` the caller passes (no host clock).
- **No AI in any deterministic path.** AI is a thin, provider-agnostic, OFF-by-default seam (GRAPH-007
  `HealthAiExplainer`) that can only annotate already-computed lines; the deterministic findings are always
  the source of truth and the report completes with no AI runtime (AC4).
- **No v1 runtime imports. No new durable state, command, or sync unit** — these are pure read/derivation
  surfaces over existing state, so there are no persistence/migration/conflict/sync implications. No
  GUI/route/layout files were touched.

## Quality gates (all run; all green)

- `pnpm --filter @dndtools/v2-core test` → **130 files, 1806 passed** (+47 new across 4 GRAPH files:
  graph-quality-intelligence 14, graph-health-coverage 11, graph-date-relationships 9, graph-link-repair 13).
- `pnpm v2:typecheck` (core `tsc --noEmit` + app `svelte-check`) → **0 errors, 0 warnings** (819 files).
- `pnpm v2:lint` (boundary script) → **passed**.
- `pnpm lint` (full eslint + nav-layer + token-compliance + repo-boundary audit) → **passed** (132 Svelte
  files; guardrail tests 5 passed).
- `pnpm docs:validate` → **passed**.
- `pnpm v2:workpack:validate` → **passed**.
- `pnpm e2e` (full Playwright suite, BOTH `desktop-chromium` and `mobile-chromium`) → **499 passed, 21
  skipped, 0 failed** (unchanged from the baseline — this epic touches no GUI/route/layout, so the suite is
  unaffected; run for confidence).

## Changed files

- `apps/v2/packages/core/src/state/graph-quality.ts` (new) — GRAPH-003 pure engine (unresolved links + repair
  candidates, disambiguation, orphans, hubs, relationship-quality scores).
- `apps/v2/packages/core/src/queries/graph-quality-query.ts` (new) — GRAPH-003 actor-filtered surface.
- `apps/v2/packages/core/src/state/graph-health.ts` (new) — GRAPH-007 pure health/coverage engine + optional
  AI-explanation seam.
- `apps/v2/packages/core/src/queries/graph-health-query.ts` (new) — GRAPH-007 DM-only + player-scoped surface.
- `apps/v2/packages/core/src/state/graph-dates.ts` (new) — GRAPH-009 pure date-relationship index engine.
- `apps/v2/packages/core/src/queries/graph-dates-query.ts` (new) — GRAPH-009 actor-filtered calendar graph API.
- `apps/v2/packages/core/src/state/graph-link-repair.ts` (new) — GRAPH-010 pure link-picker + bulk-repair
  preview + dead-link detection engine.
- `apps/v2/packages/core/src/queries/graph-link-repair-query.ts` (new) — GRAPH-010 actor-filtered +
  capability-scoped link-repair surface.
- `apps/v2/packages/core/src/index.ts` — export the new GRAPH-003/007/009/010 engines + query surfaces.
- `apps/v2/packages/core/tests/graph-quality-intelligence.test.ts` (new) — 14 GRAPH-003 tests.
- `apps/v2/packages/core/tests/graph-health-coverage.test.ts` (new) — 11 GRAPH-007 tests.
- `apps/v2/packages/core/tests/graph-date-relationships.test.ts` (new) — 9 GRAPH-009 tests.
- `apps/v2/packages/core/tests/graph-link-repair.test.ts` (new) — 13 GRAPH-010 tests.
- `docs/planning/v2/epics/GRAPH-deterministic-quality-intelligence.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/workpack-state.yaml` — generated workpack status updates (active → complete).
- `docs/planning/v2/epics/GRAPH-deterministic-quality-intelligence.completion.md` (this file).

## Known / deferred gaps

- The quality/health surfaces analyze the NOTE↔NOTE wikilink graph + content date references (the GRAPH-003/
  007/009/010 scope). Object↔note, note↔POI, and cross-source structural edges are owned by other GRAPH
  branches (GRAPH-001 source indexing, GRAPH-004 visualization, GRAPH-005/006 incremental APIs) and are
  intentionally out of this epic; the `QualityNode`/`DateIndexEntry` shapes + the `getContentItemsForActor`
  composition are the seam those branches extend.
- The optional AI explanation (GRAPH-007) is a provider-agnostic, off-by-default annotate-only seam per
  ADR-014 (no model is embedded); a future AI ADR plugs a real explainer into `HealthAiExplainer` without
  changing the deterministic contract.
- No GUI is added in this epic; the computed models are exported for a future GRAPH visualization/diagnostics
  GUI pass to render (the full e2e suite remains green because no visible flow changed).

## Git evidence

- Branch: `epic/GRAPH-deterministic-quality-intelligence` (chained off the prior epic tip `785e3cd`).
- Commit SHA (feature + tests + completion evidence + regenerated workpack): `0de43db`
  This `docs(v2): record commit SHA ...` follow-up writes that SHA into this evidence file.

### `git status --short` (after the feature commit; before this SHA-recording commit)

```
 M docs/planning/v2/epics/GRAPH-deterministic-quality-intelligence.completion.md
```

After this SHA-recording commit lands the working tree is clean — no untracked or unstaged files.
