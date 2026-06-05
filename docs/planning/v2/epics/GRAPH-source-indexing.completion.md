# GRAPH-source-indexing — Completion Evidence

Workpack status: `complete`

Epic: **GRAPH-source-indexing** — "GRAPH: Source indexing"
Requirements: **GRAPH-001**, **GRAPH-008**
Branch: `epic/GRAPH-source-indexing` (chained off the prior tip `246da19`).

## Summary

This epic delivers the **source-indexing foundation** of the Graph Engine: building the link graph
**FROM the content sources** (local files, Obsidian notes, Google Docs documents) **across all
configured sync sources**, and **preserving the per-node source-specific identifiers + revision
metadata** needed to reconcile a graph node back to its source artifact. It is built entirely on the
GRAPH surfaces already in place (GRAPH-005 incremental index, GRAPH-002 relationships, the SRCH
freshness convention, the SYNC source-adapter taxonomy) — it does **not** introduce a second graph or
a second source layer.

- **GRAPH-001 (index across all configured sync sources)** — a PURE deterministic source-indexing
  engine (`state/graph-source-index.ts`) that builds the structural graph with the **same**
  `buildGraphIndex` engine GRAPH-005 uses (identical nodes/edges/ordering), tags every node with its
  `GraphSourceRef` provenance, indexes across all configured sources, and tracks **per-source +
  overall FRESHNESS** by **reusing the SRCH `SearchIndexCursor` shape +
  `domainFreshnessStatus`/`publishDomainFreshness` functions + the same
  `fresh`/`partial`/`stale`/`unknown` statuses and fail-closed rule**. A configured source that is not
  cached/available marks its slice — and the overall index — `partial`/`stale` **without blocking the
  cached relationships that DID index**. The actor-filtered surface
  (`queries/graph-source-index-query.ts`) feeds the engine only the actor's visible
  notes/objects/maps/POIs (composed from the existing `getContentItemsForActor` + `getMapViewForActor`
  reads), so a player never discovers a hidden node, edge, source ref, or diagnostic.
- **GRAPH-008 (preserve source-specific identifiers + revision metadata)** — the same modules preserve
  a `GraphSourceRef` (`sourceId`, `sourceKind`, `externalId`, `documentId`, `revisionId`) for every
  node, derived from the source metadata the **source adapters / import already recorded** in the
  content item's fields (the import `sourcePath`, the `dndtools.*` namespaced source metadata, the env
  source id). Reading provenance is **read-only** — it never mutates the item and never overwrites
  user-authored frontmatter; aliases come from the already-parsed `aliases` list, isolated from user
  properties. When source metadata is unavailable offline, the source diagnostics show cached metadata
  as `stale`/`partial` rather than silently recomputing it.

No GUI / route / layout / Svelte files were touched — this is a Processing Core API epic only.

## How it composes the existing graph + freshness + source conventions

- **One structural graph.** `buildSourceGraphIndex` calls the **same** `buildGraphIndex`
  (`state/graph-index.ts`) the GRAPH-005 index uses, so the source graph's nodes/edges are identical to
  the structural graph the rest of the app sees. A `SourceGraphNodeRecord` is a `GraphNodeRecord` plus
  its `GraphSourceRef` — the source detail rides alongside the one graph.
- **One freshness convention.** `sourceFreshnessStatus`/`publishSourceFreshness` project a configured
  source onto the SRCH `SearchDomainIndex` shape and call the **shared** `domainFreshnessStatus` /
  `publishDomainFreshness` from `state/search-index.ts`. There is no second freshness language; an
  unavailable source's cursor is pushed one ahead so the shared function grades it `stale`/`partial`.
- **One source taxonomy.** `GraphSourceKind` reuses the SYNC source-adapter kinds (`local-vault` /
  `obsidian-vault` / `google-docs` / future). The union is open, so a future source needs no core
  change. Provenance is derived from the same fields the adapters/import write — no parallel ingestion.
- **One visibility choke-point.** Every node/edge/source-ref/diagnostic is derived from
  `getContentItemsForActor` + `getMapViewForActor`, which decide visibility before the engine sees
  anything (Cross-Contract Non-Negotiable 2). The DM and a player differ only by which entities are
  visible — there is no parallel index that could leak hidden structure.

## Requirement traceability

### GRAPH-001 — index across all configured sync sources (Must-have)

- AC1: *Given local, Obsidian, and Google Docs notes are cached, when graph indexing runs offline, then
  cached relationships are queryable.*
  - Code: `state/graph-source-index.ts` (`buildSourceGraphIndex`, `configuredSourceFromRecords`);
    `queries/graph-source-index-query.ts` (`getSourceGraphIndexForActor`,
    `buildSourceGraphRecordsForActor`). Builds entirely from local cached state with zero network.
  - Tests (`apps/v2/packages/core/tests/graph-source-indexing.test.ts`): "builds the SAME structural
    nodes/edges as the GRAPH-005 engine and tags every node with provenance",
    "AC1: cached relationships across sources are queryable; the Google-Docs node carries its
    provenance" (asserts a local note ⇄ Google-Docs note edge is queryable from the cached graph and
    both sources are indexed across).
- AC2: *Given a player queries the graph, when hidden nodes exist, then those nodes and edges are
  omitted.*
  - Code: `queries/graph-source-index-query.ts` (actor-filtered records via `getContentItemsForActor`
    + `getMapViewForActor`); `state/graph-source-index.ts` (`sourceRefForNode` returns `null` for a
    node absent from the visible index).
  - Tests: "AC2: the player source graph OMITS the hidden node, its edge, AND its source ref (fail
    closed)" (the player payload never contains the hidden id/title/source path), "the DM source graph
    DOES carry the hidden node + its provenance (DM authority by role)", "an unknown/unauthenticated
    actor gets the empty index (fail closed)", and the map/POI fail-closed test.
- AC3: *Given a configured source is not cached and the app is offline, when indexing runs, then cached
  graph data is marked partial without blocking visible cached relationships.*
  - Code: `state/graph-source-index.ts` (`combineSourceStatuses`, `isSourceGraphPartial`,
    `sourceGraphDiagnostics`); `queries/graph-source-index-query.ts` (`SourceGraphAvailability`,
    `getSourceGraphDiagnosticsForActor`, `isSourceGraphPartialForActor`). An unavailable source is an
    empty/`stale` slice that marks the overall index `partial` while the cached nodes still serve.
  - Tests: "the overall index is PARTIAL/STALE when any source is unavailable, but the cached nodes
    still serve", "a configured but not-cached Google-Docs source marks the graph PARTIAL without
    blocking cached nodes", "diagnostics report the not-cached source as STALE rather than silently
    recomputed (no content leak)", "when every configured source is cached, the graph is FRESH and not
    partial".

### GRAPH-008 — preserve source-specific identifiers + revision metadata (Must-have)

- AC1: *Given a Google Docs note is indexed, when its node is selected, then the graph record includes
  source id and document id metadata.*
  - Code: `state/graph-source-index.ts` (`GraphSourceRef`, `sourceRefForNode`, `sourceGraphNodes`);
    `queries/graph-source-index-query.ts` (`sourceRefForContentItem` derives source id / document id /
    revision id from the item fields; `getSourceRefForActor`, `getSourceGraphNodesForActor`).
  - Tests: "AC1: a Google Docs node carries its source id and document id (+ revision) metadata",
    "AC1: cached relationships across sources are queryable; the Google-Docs node carries its
    provenance", "the source-aware node projection joins every visible node with its provenance,
    deterministically", "a node with no recorded provenance carries the fail-closed unknown ref",
    "a node id absent from the visible index resolves to null (fail closed, no leak)".
- AC2: *Given an Obsidian note has aliases in properties, when indexed, then aliases resolve without
  overwriting user-authored frontmatter.*
  - Code: `queries/graph-source-index-query.ts` (`contentSourceNodeRecord` reads aliases from the
    read-only `parseMarkdownNote(...).aliases` list; provenance derivation never writes back).
  - Tests: "GRAPH-008 AC2 — Obsidian aliases resolve without overwriting user frontmatter" (a note's
    `aliases: [The Keep]` resolves a `[[The Keep]]` link to its node **and** the stored item's
    user-authored `author: Trent` field is unchanged after indexing).
- AC3: *Given source metadata is unavailable offline, when graph diagnostics open, then cached metadata
  is shown as stale or partial rather than silently recomputed.*
  - Code: `state/graph-source-index.ts` (`sourceGraphDiagnostics`, `publishSourceFreshness`,
    `sourceDiagnosticMessage`); `queries/graph-source-index-query.ts`
    (`getSourceGraphDiagnosticsForActor`).
  - Tests: "diagnostics report the not-cached source as STALE rather than silently recomputed (no
    content leak)" (the diagnostic message names the source kind + the stale-not-recomputed posture and
    carries no content), plus the per-source freshness tests
    ("an UNAVAILABLE (not-cached) source is STALE — never fresh").

## Demo path (programmatic — Processing Core APIs, no GUI surface)

This epic adds programmatic core APIs (no visible flow). A reviewer can exercise them through the
public `@dndtools/v2-core` exports:

1. Build the actor-filtered source graph:
   `getSourceGraphIndexForActor(content, maps, session, permissions, actorId, defaultSourceId,
   availability?)` returns `{ graph, sourceRefs, sources, status }` — the visible nodes + edges plus
   per-node provenance and per-source freshness.
2. Reconcile a node back to its source: `getSourceRefForActor(index, nodeId)` returns the
   `{ sourceId, sourceKind, externalId, documentId, revisionId }` for a visible node, or `null` for a
   hidden/absent node (fail closed). `getSourceGraphNodesForActor(index)` joins every visible node with
   its provenance.
3. Index across an offline/not-cached source: pass
   `{ configuredSources: [{ sourceId: 'gdocs-remote', kind: 'google-docs', available: false }] }` —
   `isSourceGraphPartialForActor(index)` is `true` and `getSourceGraphDiagnosticsForActor(index)`
   reports that source as `stale`/`partial`, while the cached nodes/edges still serve.
4. Prove determinism: two builds over identical sources return deep-equal indexes
   (`getSourceGraphIndexForActor(...)` ⇒ `getSourceGraphIndexForActor(...)` are `.toEqual`).

The fastest reviewer path is the test suite:
`pnpm --filter @dndtools/v2-core test` (file
`apps/v2/packages/core/tests/graph-source-indexing.test.ts`, 22 cases).

## Quality gates (all run, all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | **PASS** — 132 files, 1862 tests (incl. the 22 new GRAPH-001/008 cases) |
| New-file tests | `pnpm exec vitest run graph-source-indexing` (in core) | **PASS** — 1 file, 22 tests |
| Typecheck | `pnpm v2:typecheck` | **PASS** — core `tsc --noEmit` clean; app `svelte-check` 824 files, 0 errors, 0 warnings |
| v2 boundary lint | `pnpm v2:lint` | **PASS** — v2 boundary lint passed |
| Full ESLint | `pnpm lint` | **PASS** — eslint + nav-layer lint (132 files) + token lint (132 files) + repo-boundary audit (5 tests) |
| Docs validation | `pnpm docs:validate` | **PASS** — docs validation passed |
| Workpack validation | `pnpm v2:workpack:validate` | **PASS** — v2 workpack validation passed |
| Playwright e2e | `pnpm e2e` (apps/v2/app) | **N/A — not run.** No route/layout/Svelte/visible-flow file changed (changes are pure `@dndtools/v2-core` APIs + generated planning files). The suite remains green (499 passed / 21 skipped / 0 failed) and is not implicated by this epic. |

## Quality review

- **Correctness:** All three GRAPH-001 criteria (offline cached relationships across sources, hidden
  node/edge omission, partial-when-not-cached) and all three GRAPH-008 criteria (source id + document
  id metadata, alias resolution without frontmatter overwrite, stale/partial-not-recomputed diagnostics)
  are implemented and tested, including the determinism (reindex reproducibility + source-change
  consistency) proofs.
- **Architecture:** Pure deterministic engine in the Processing Core; the actor-filtered query layer is
  the only visibility choke-point. No GUI/DOM/Svelte/platform/Node/cloud/MCP-runtime/v1 imports. Reuses
  the GRAPH-005 structural engine, the SRCH freshness functions, the shared wikilink parser, and the
  SYNC source taxonomy (no parallel mechanisms). Obeys ADR-014 package boundaries and Contract 1
  (Processing/Display Decoupling) + Contract 2 (Cloud Sync & Offline Model — source adapters expose
  ids/revisions, local-first, rebuildable cache index).
- **Determinism / reproducibility:** Every list has a total tie-breaker; identical sources produce
  deep-equal indexes (asserted at both the pure-engine and per-actor levels), and a source change
  produces a consistent index (adding a link adds exactly one edge).
- **Data safety / fail-closed:** Provenance is derived only for actor-visible nodes, so a source ref or
  diagnostic can never surface a hidden node; an unavailable/not-cached source is never `fresh` (fail
  closed to `stale`/`partial`); a request for a hidden node's ref returns `null` indistinguishable from
  "no such node". Hard non-leak assertions (the player payload never contains a hidden id/title/source
  path) back this.
- **Permissions / visibility:** DM bypass is by role (Contract 3); the player and DM graphs differ only
  by visible entities. Reading provenance never mutates state or overwrites user frontmatter.
- **Sync/offline:** The source graph is built entirely from local cached state (local-first). A
  configured source whose content is not cached on the device marks the index `partial`/`stale` with a
  diagnostic, without discarding the cached relationships. Source ids/revisions are preserved exactly as
  the adapter/import recorded them (Contract 2 Sync Source Contract).
- **Accessibility / performance / UX:** No visible surface added; nothing to render. The
  computed `status` + diagnostics are ready for a future GUI staleness banner.
- **Maintainability:** Two small cohesive modules + one test file; no speculative abstractions; no
  unrelated refactors. Comment density and test idioms match the existing GRAPH modules.
- **Docs:** Module-level doc comments explain composition + fail-closed reasoning; this completion
  evidence records traceability and gates.

## Known gaps / deferred

- **Provenance ingestion is contract-shaped, not transport-wired.** Per ADR-014 the first prototype is
  single-device with no live Obsidian/Drive transport, and the `content.import-from-obsidian` /
  `content.import-from-google-docs` adapter ops are not yet reduced into content state. This epic
  therefore reads provenance from the source metadata the adapters/import **already record** in a
  content item's fields (the import `sourcePath`, the `dndtools.*` namespaced source metadata). When the
  live transports land and write structured source records, the same `sourceRefForContentItem` derivation
  applies unchanged — the seam (the `dndtools.sourceId`/`sourceKind`/`documentId`/`revisionId` field
  convention) is in place.
- **Source availability is supplied per build, not yet persisted.** `SourceGraphAvailability` lets the
  caller declare which configured sources are cached/reachable. Real availability tracking
  (from `SourceCursorRecord` / the future sync transport) is deferred by design; the partial/stale model
  reacts to whatever availability the caller supplies.
- **No GUI surface.** A source-provenance inspector / staleness banner is a future GUI epic; the
  computed `SourceGraphIndex` (nodes-with-provenance + diagnostics + `status`) is ready for it to render.

## Changed files (full repo-relative paths)

- `apps/v2/packages/core/src/state/graph-source-index.ts` (new) — GRAPH-001/008 pure source-indexing
  engine (provenance, per-source freshness, partial/stale diagnostics).
- `apps/v2/packages/core/src/queries/graph-source-index-query.ts` (new) — GRAPH-001/008 actor-filtered
  surface (source-aware records, provenance derivation, diagnostics).
- `apps/v2/packages/core/tests/graph-source-indexing.test.ts` (new) — GRAPH-001/008 coverage (22 tests).
- `apps/v2/packages/core/src/index.ts` (modified) — public exports for the new GRAPH-001/008 surfaces.
- `docs/planning/v2/epics/GRAPH-source-indexing.yaml` (generated) — status → active/complete.
- `docs/planning/v2/status.yaml` (generated) — recomputed status.
- `docs/planning/v2/workpack-state.yaml` (source of truth) — epic status.
- `docs/planning/v2/epics/GRAPH-source-indexing.completion.md` (new) — this evidence.

## Git evidence

- Branch: `epic/GRAPH-source-indexing`
- Feat commit SHA: `__FEAT_SHA__` (recorded by the follow-up `docs(v2): record commit SHA …` commit).
- Workpack-complete commit SHA: `__COMPLETE_SHA__`
- SHA-recording follow-up commit: this commit (`docs(v2): record commit SHA …`).

Final `git status --short` (after the SHA-recording commit — clean slate):

```
(empty)
```
