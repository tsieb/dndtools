# GRAPH-visualization — Completion Evidence

Workpack status: `complete`

Epic: `GRAPH-visualization` — GRAPH: Visualization
Requirement: **GRAPH-004**
Architecture contract: Contract 3 (Role, Visibility & Permission Grant Model); Contract 1 (Processing/Display decoupling).

## Summary

Delivered the GRAPH visualization GUI that SURFACES the link graph the prior GRAPH epics already
compute. It does **not** recompute the graph or add a second graph source. The new
`getGraphVisualizationForActor` view-model query COMPOSES the existing actor-filtered
`getSourceGraphIndexForActor` (GRAPH-001/008 — nodes + edges + per-node source provenance), enriches
note/object nodes with `folder` + `tags` using the SAME derivation the SRCH filter surface uses
(`dndtools.folder` field + parsed frontmatter/inline tags from the SAME actor-filtered
`getContentItemsForActor` read), and applies the GRAPH-004 filters (folder, tag, entity type, source,
relationship type, visibility-safe text). All graph derivation stays in the Processing Core; the GUI
renders a computed, actor-filtered model and navigates via the existing `/knowledge/?note=<id>` link
only.

## User-visible demo path

1. `pnpm v2:dev`, open the app, go to `/knowledge/` (the Knowledge section).
2. Create a couple of player-visible notes that wikilink each other (e.g. `Highmoor` with `#keep`, and
   `Quest Log` with body `The party set out for [[Highmoor]] at dawn. #travel`).
3. Scroll to the **Graph visualization** panel (`data-testid="graph-visualization"`). The graph renders
   as an accessible node-relationship **table**: each row is a node (note/object/map/POI) with its type,
   folder, tags, source, "Links to", and "Linked from" relationships. Note/object nodes are real links
   that open the note in the Knowledge section.
4. Use the filters (Search text, Folder, Tags, Entity type, Source, Relationship type) to narrow the
   graph. The count region reports "Showing X of Y visible nodes, N relationships".
5. Switch the header **View as** control to `Demo Player`: the dm-only nodes, their edges, the dm-only
   demo map POI (`Smugglers' Cache`), and any folder/tag/count that exists only because of hidden content
   all disappear — the player's graph is indistinguishable from a vault without that hidden material.
6. On a narrow viewport the filter controls collapse into a single **Filters** disclosure (the simplified
   compact control surface).

## Requirement coverage / traceability (GRAPH-004)

Statement: *A user shall be able to view a filtered graph visualization by folder, tag, entity type,
source, relationship type, and visibility-safe search text.*

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — Given a graph with notes and maps, when the user filters by `map`, then only visible map nodes and their visible edges are shown. | `getGraphVisualizationForActor` `kinds` filter keeps only nodes of the selected entity type and only edges whose both endpoints survive (`apps/v2/packages/core/src/queries/graph-visualization-query.ts`); GUI entity-type checkboxes (`apps/v2/app/src/lib/gui/GraphVisualization.svelte`). A hidden map never enters the model (composed from `getSourceGraphIndexForActor`). | core `apps/v2/packages/core/tests/graph-visualization.test.ts` ("GRAPH-004 AC1 — filtering by entity type `map`"); e2e `apps/v2/app/tests/e2e/graph-visualization.spec.ts` ("the entity-type filter restricts to maps…", "AC1 + fail closed…"). |
| AC2 — Given the graph is opened on mobile, when filters are used, then the graph remains accessible through a simplified control surface. | On a compact profile (`useProfile().isCompact`) the filter form collapses into a single `<details>` disclosure; the same filters/model/table are used on every profile (`apps/v2/app/src/lib/gui/GraphVisualization.svelte`). | e2e `apps/v2/app/tests/e2e/graph-visualization.spec.ts` ("AC2: on a compact profile the filters collapse…") on `mobile-chromium` + `desktop-chromium`. |
| Filter facets (folder, tag, entity type, source, relationship type, search text) | Each facet is an intersective filter in the core query; folders/tags derived from the SAME actor-filtered content read; source reuses the GRAPH source taxonomy on each node's `GraphSourceRef`; relationship kind classified from edge endpoints (`poi-link` vs `wikilink`). | core `apps/v2/packages/core/tests/graph-visualization.test.ts` ("filters intersect over visible content only", "relationship-type filter and facets"). |
| Actor filtering / fail closed (Contract 3) | Composed from `getSourceGraphIndexForActor`; an unknown actor ⇒ empty model; a player never receives a hidden node, edge, facet, or count. | core `apps/v2/packages/core/tests/graph-visualization.test.ts` ("FAIL CLOSED: a player never sees the dm-only node…", "an unknown/unauthenticated actor receives the EMPTY model", observer ceiling); e2e ("AC1 + fail closed…"). |
| Empty / loading / error & partial-source states | GUI renders loading, empty (no visible content), no-matches, and a non-leaking partial-source status region from `viz.partial` + `viz.sourceDiagnostics` (GRAPH-001 AC3). | core ("partial/offline source signal"); GUI states rendered. |

## Accessibility (required for a graph visualization)

The primary rendering is a keyboard-navigable, screen-reader-accessible **table** (`<table>` with a
`<caption>`, `<th scope="col">` column headers, `<th scope="row">` row headers) of nodes and their
relationships — there is no pointer-only canvas. Every note/object node is a real `<button>`/link that
navigates to the note in the Knowledge section, so the entire graph is operable by keyboard alone. The
count region is an `aria-live="polite"` status. The compact-profile control surface is a native
`<details>`/`<summary>` disclosure. Token/navigation lint and `svelte-check` pass.

## Visibility filtering (player vs DM)

The model is composed entirely from the existing actor-filtered choke-points
(`getSourceGraphIndexForActor` → `getContentItemsForActor` + `getMapViewForActor`), so a `dm-only` /
`shared`-but-undelivered / soft-deleted / hidden node is never a node, an edge endpoint, a facet, or a
count. Facets (folders, tags, sources, kinds, relationship kinds) and the "showing X of Y" counts are
computed over the actor's VISIBLE graph only. Verified for DM, player, observer, and unknown actor in
core tests, and end to end via the "View as" switch (the dm-only note `Assassins Guild`, its `#villain`
tag, and the dm-only demo POI `Smugglers' Cache` all vanish for the player).

## Quality gates (all run, all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit tests | `pnpm --filter @dndtools/v2-core test` | 133 files, 1879 passed (incl. 15 new in `graph-visualization.test.ts`) |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | 12 files, 55 passed |
| Typecheck | `pnpm v2:typecheck` | core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings (827 files) |
| Boundary lint | `pnpm v2:lint` | passed |
| Full ESLint (+ nav/token/audit) | `pnpm lint` | passed |
| Docs validate | `pnpm docs:validate` | passed |
| Workpack validate | `pnpm v2:workpack:validate` | passed |
| E2E (both projects) | `pnpm e2e` (from `apps/v2/app`) | 509 passed, 21 skipped, 0 failed (baseline 499 + 10 new = 5 specs × desktop-chromium & mobile-chromium) |

## Changed files

- `apps/v2/packages/core/src/queries/graph-visualization-query.ts` (new) — the actor-filtered GRAPH-004
  visualization view-model query.
- `apps/v2/packages/core/src/index.ts` — export the new query, types, and `GRAPH_RELATIONSHIP_KINDS`.
- `apps/v2/packages/core/tests/graph-visualization.test.ts` (new) — core coverage (15 tests).
- `apps/v2/app/src/lib/gui/GraphVisualization.svelte` (new) — the visualization GUI (accessible table +
  filters + compact control surface).
- `apps/v2/app/src/routes/knowledge/+page.svelte` — mount `GraphVisualization` on the Knowledge route.
- `apps/v2/app/tests/e2e/graph-visualization.spec.ts` (new) — e2e coverage (5 tests × 2 projects).
- `docs/planning/v2/epics/GRAPH-visualization.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/workpack-state.yaml` — generated workpack status updates (active → complete).
- `docs/planning/v2/epics/GRAPH-visualization.completion.md` (new) — this evidence file.

## Known / deferred gaps

- Folder filtering relies on the `dndtools.folder` field, which the prototype note editor does not yet
  author; folder filtering is fully covered by the core tests but is not directly seedable through the
  note-editor UI, so the e2e folder assertion is exercised at the core level. (No leak — folders only
  ever name visible content.)
- The visualization renders the graph as a structured table (the accessible primary view). A separate
  spatial/canvas rendering is intentionally NOT added (ADR-014 defers a canvas/WebGL engine); the table
  is the keyboard/SR-accessible model and is the complete, non-deferred deliverable.
- Source filtering uses the GRAPH source taxonomy carried on each node's `GraphSourceRef`. Notes only
  carry an explicit `dndtools.sourceKind` when imported; un-provenanced local notes are `local-vault`.

## Git evidence

- Branch: `epic/GRAPH-visualization` (chained off the prior epic tip `43d3a87`).
- Commit SHA: (recorded in the follow-up `docs(v2): record commit SHA` commit).

### `git status --short`

```
(clean — see the recorded final status in the SHA follow-up commit)
```
