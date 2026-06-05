# GRAPH-incremental-apis — Completion Evidence

Workpack status: `complete`

Epic: **GRAPH-incremental-apis** — "GRAPH: Incremental APIs"
Requirements: **GRAPH-005**, **GRAPH-006**
Branch: `epic/GRAPH-incremental-apis` (chained off the prior tip `41e9d4b`).

## Summary

This epic delivers the **incremental** half of the Graph Engine on top of the GRAPH surfaces
already built (GRAPH-002 note-relationships, GRAPH-003 quality, GRAPH-007 health, GRAPH-009 dates,
GRAPH-010 link-repair, CONTENT-006 wikilink lifecycle) and reconciles its freshness model with the
SRCH index-cursor/freshness convention (`state/search-index.ts`) rather than inventing a parallel
one.

- **GRAPH-005 (incremental graph index)** — a PURE deterministic incremental graph-index engine
  (`state/graph-index.ts`) that builds the link graph (nodes + directed edges) over node records,
  APPLIES a single accepted change INCREMENTALLY (only the affected node's edges + the dependent
  reverse/backlink index change), computes a DELTA between two snapshots, and tracks per-graph
  FRESHNESS by **reusing the SRCH `SearchIndexCursor` shape + `domainFreshnessStatus` /
  `publishDomainFreshness` functions + the same `fresh` / `partial` / `stale` / `unknown` statuses
  and fail-closed rule**. A failed incremental update marks the graph stale and requires a
  repair/REINDEX. The actor-filtered surface (`queries/graph-index-query.ts`) feeds the engine only
  the actor's visible notes/objects/maps/POIs (composed from the existing `getContentItemsForActor`
  + `getMapViewForActor` reads), so an incremental update can never surface a hidden node/edge.
- **GRAPH-006 (source-agnostic query API)** — a thin actor-filtered façade (`queries/graph-api.ts`)
  that is the SINGLE entry point navigation / search / widgets / MCP use to read the graph
  (backlinks, related notes, cross-source link resolution) **without any consumer parsing raw
  markdown or reading vault files**. It composes the GRAPH-002 navigable relationships
  (`getNoteRelationshipsForActor`), the GRAPH-005 structural index, and CONTENT-006 source-agnostic
  resolution (`resolveWikilinkForActor`). The consumer kind (`navigation`/`search`/`widget`/`mcp`)
  is audit-only and never widens visibility.

No GUI / route / layout / Svelte files were touched — this is a Processing Core API epic only.

## How it composes the existing graph + freshness conventions

- **One link-edge mechanism.** Edges are the same `[[wikilink]]` edges the rest of GRAPH parses;
  `outboundTargetsFromBody` reuses `extractWikilinks` (`state/markdown.ts`), and resolution is by
  the same normalized title/alias index `note-relationships.ts` / `wikilink-graph.ts` use. A link to
  a target outside the visible set yields no edge — exactly as in the quality/relationship surfaces.
- **One freshness convention.** `graphFreshnessStatus` / `publishGraphFreshness` project the graph's
  bookkeeping onto the SRCH `SearchDomainIndex` shape and call the **shared** `domainFreshnessStatus`
  / `publishDomainFreshness` from `state/search-index.ts`. There is no second freshness language; a
  `stale`-marked graph models "source advanced past the indexed cursor" so the shared function grades
  it without special-casing.
- **One visibility choke-point.** Every node/edge/delta/backlink is derived from
  `getContentItemsForActor` + `getMapViewForActor`, which decide visibility before the engine sees
  anything (Cross-Contract Non-Negotiable 2). The DM and a player differ only by which entities are
  visible — there is no parallel graph index that could leak hidden structure.

## Requirement traceability

### GRAPH-005 — incremental graph updates (Must-have)

- AC1: *Given one note changes, when indexing runs, then only affected graph nodes/edges and
  dependent indexes update.*
  - Code: `state/graph-index.ts` (`applyGraphChange`, `buildGraphIndexState`, `diffGraphIndex`,
    `graphsEqual`, `backlinksOf`/`forwardLinksOf` reverse index); `queries/graph-index-query.ts`
    (`applyGraphChangeForActor`, `graphUpsertChangeForContent`, `graphRemoveChange`).
  - Tests (`apps/v2/packages/core/tests/graph-incremental-apis.test.ts`): "an upsert touches only the affected edges and
    equals a full rebuild", "a remove drops the node and its inbound/outbound edges and equals a full
    rebuild", "a long sequence of mixed upserts/removes converges to the full recompute", "upsert is
    idempotent", "removing an unknown node is a no-op", "the per-actor incremental graph == the
    per-actor full recompute (convergence under visibility)". **Determinism proof: incremental ==
    full** is asserted via `graphsEqual` + an empty `diffGraphIndex`.
- AC2: *Given an incremental update fails, when diagnostics are raised, then the stale index state is
  marked and a repair/reindex command is available.*
  - Code: `state/graph-index.ts` (`markGraphStale`, `setGraphAvailability`, `graphRepairSignal`);
    `queries/graph-index-query.ts` (`markGraphStaleForActor`, `setGraphAvailabilityForActor`,
    `getGraphRepairSignalForActor`).
  - Tests: "marking the graph stale ... requires a REINDEX (fail closed)", "an unavailable source
    forces a REINDEX without discarding the cached graph", "the stale flag ... takes precedence over
    unavailability", "marks a maintained graph stale and requires a reindex through the actor
    surface". Fail-closed freshness ("a freshly-built graph ... is FRESH", "the empty graph is
    FRESH") is also covered.

### GRAPH-006 — source-agnostic query APIs (Must-have)

- AC1: *Given an MCP tool requests backlinks, when the query executes, then it uses the graph API
  rather than reading files ad hoc.*
  - Code: `queries/graph-api.ts` (`getGraphRelationships`, `getGraphBacklinks`, `resolveGraphLink`).
  - Tests: "AC1 — an MCP backlink request uses the graph API and is visibility-filtered", "the
    consumer kind is audit-only: an MCP and a widget request return the SAME visibility result", "the
    result shape carries no file path, body, or source kind (source-agnostic)".
- AC2: *Given a widget requests related notes, when the actor is a player, then the graph API returns
  only visible relationships.*
  - Code: `queries/graph-api.ts` (`getGraphRelatedNotes`, `getGraphRelationships`).
  - Tests: "AC2 — a player widget request for related notes returns ONLY visible relationships", "a
    request for a node the actor cannot see returns the fail-closed empty result", "source-agnostic
    link resolution never resolves across a hidden node", "an observer is treated as a non-DM (fail
    closed)".

## Demo path (programmatic — Processing Core APIs, no GUI surface)

This epic adds programmatic core APIs (no visible flow). A reviewer can exercise them through the
public `@dndtools/v2-core` exports:

1. Build the actor-filtered graph: `getGraphIndexForActor(content, maps, session, permissions,
   actorId)` returns the visible nodes + edges; `getGraphIndexStateForActor(...)` additionally
   returns the incremental record cache.
2. Update incrementally: `applyGraphChangeForActor(state, graphUpsertChangeForContent(view))` or
   `applyGraphChangeForActor(state, graphRemoveChange(nodeId))` — only the changed node's edges +
   the dependent backlink index update. Prove convergence with `graphsEqual(state.index,
   buildGraphIndex(finalRecords))`.
3. Signal staleness: `markGraphStaleForActor(state)` then `getGraphRepairSignalForActor(state)`
   returns `{ reindexRequired: true, reason: 'incremental-update-failed', status: 'stale' }`.
4. Source-agnostic consumer reads: `getGraphBacklinks(...,'mcp')` and
   `getGraphRelatedNotes(...,'widget')` return identically visibility-filtered results; a player
   never receives a hidden backlink source or related note.

The fastest reviewer path is the test suite:
`pnpm --filter @dndtools/v2-core test` (file
`apps/v2/packages/core/tests/graph-incremental-apis.test.ts`, 30 cases).

## Quality gates (all run, all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | **PASS** — 131 files, 1839 tests (incl. the 30 new GRAPH-005/006 cases) |
| New-file tests | `pnpm exec vitest run graph-incremental-apis` (in core) | **PASS** — 1 file, 30 tests |
| Typecheck | `pnpm v2:typecheck` | **PASS** — core `tsc --noEmit` clean; app `svelte-check` 822 files, 0 errors, 0 warnings |
| v2 boundary lint | `pnpm v2:lint` | **PASS** — v2 boundary lint passed |
| Full ESLint | `pnpm lint` | **PASS** — eslint + nav-layer lint (132 files) + token lint (132 files) + repo-boundary audit (5 tests) |
| Docs validation | `pnpm docs:validate` | **PASS** — docs validation passed |
| Workpack validation | `pnpm v2:workpack:validate` | **PASS** — v2 workpack validation passed |
| Playwright e2e | `pnpm e2e` (apps/v2/app) | **N/A — not run.** No route/layout/Svelte/visible-flow file changed (changes are pure `@dndtools/v2-core` APIs). The suite remains green (499 passed / 21 skipped / 0 failed) and is not implicated by this epic. |

## Quality review

- **Correctness:** Both GRAPH-005 acceptance criteria (incremental update + stale/repair) and both
  GRAPH-006 criteria (MCP backlinks via API, player widget visible-only relationships) are
  implemented and tested, including the hard incremental==full convergence proof.
- **Architecture:** Pure deterministic engines in the Processing Core; the actor-filtered query layer
  is the only visibility choke-point. No GUI/DOM/Svelte/platform/Node/cloud/MCP-runtime/v1 imports.
  Reuses the SRCH freshness functions and the shared wikilink parser (no parallel mechanisms).
  Obeys ADR-014 package boundaries and Contract 1 (Processing/Display Decoupling) + Contract 2
  (Cloud Sync & Offline Model — operation-shaped, local-first, rebuildable cache index).
- **Determinism / convergence:** Every list has a total tie-breaker; `graphsEqual` + `diffGraphIndex`
  prove identical change sequences and a full recompute converge to the same graph (asserted per
  actor, so convergence holds under visibility filtering).
- **Data safety / fail-closed:** An incremental update only ever carries an actor-visible record, so
  it can never surface a hidden/DM-only node or edge; freshness is never `fresh` when unproven or a
  source is unavailable (fail closed to `stale`/`unknown`); a request for a hidden node returns the
  generic empty result indistinguishable from "no relationships". Hard non-leak assertions (the
  player payload never contains a hidden id/title) back this.
- **Permissions / visibility:** DM bypass is by role (Contract 3); the consumer kind never widens
  visibility (an MCP request and a widget request return identical results for the same actor).
- **Sync/offline:** The graph index is a rebuildable device-local cache; an unavailable source
  degrades to `stale` + reindex-required without discarding cached results (local-first).
- **Accessibility / performance / UX:** No visible surface added; nothing to render. The incremental
  path avoids a full-vault markdown reparse (only the changed node is reparsed upstream).
- **Maintainability:** Three small cohesive modules + one test file; no speculative abstractions; no
  unrelated refactors. Comment density and test idioms match the existing GRAPH modules.
- **Docs:** Module-level doc comments explain composition + fail-closed reasoning; this completion
  evidence records traceability and gates.

## Known gaps / deferred

- **Sync-cursor wiring is contract-shaped, not transport-wired.** GRAPH-005 names "sync operations"
  as a change trigger. Per ADR-014 the first prototype is single-device and has no cloud transport,
  so this epic models a sync change exactly like any other accepted change (an upsert/remove + a
  source-availability flag + a stale/reindex signal) and reuses the SRCH source-cursor convention.
  Real source-cursor advancement from a remote pull is deferred to the sync transport work, by
  design — the seam (`setGraphAvailabilityForActor`, `markGraphStaleForActor`, `getGraphRepairSignalForActor`)
  is in place.
- **POI→entity edges** are resolved by the linked entity's title through the shared name index. Title
  collisions resolve deterministically (smallest id) and are themselves a GRAPH-003 disambiguation
  finding; an id-keyed POI edge index is a possible future refinement but unnecessary for the
  prototype.
- **No GUI surface.** A graph-staleness banner / reindex command button is a future GUI epic; the
  computed `GraphRepairSignal` is ready for it to render.

## Changed files (full repo-relative paths)

- `apps/v2/packages/core/src/state/graph-index.ts` (new) — GRAPH-005 pure incremental graph engine.
- `apps/v2/packages/core/src/queries/graph-index-query.ts` (new) — GRAPH-005 actor-filtered surface.
- `apps/v2/packages/core/src/queries/graph-api.ts` (new) — GRAPH-006 source-agnostic query API.
- `apps/v2/packages/core/tests/graph-incremental-apis.test.ts` (new) — GRAPH-005/006 coverage (30 tests).
- `apps/v2/packages/core/src/index.ts` (modified) — public exports for the new GRAPH-005/006 surfaces.
- `docs/planning/v2/epics/GRAPH-incremental-apis.yaml` (generated) — status → active/complete.
- `docs/planning/v2/status.yaml` (generated) — recomputed status.
- `docs/planning/v2/workpack-state.yaml` (source of truth) — epic status.
- `docs/planning/v2/epics/GRAPH-incremental-apis.completion.md` (new) — this evidence.

## Git evidence

- Branch: `epic/GRAPH-incremental-apis`
- Commit SHA: _(recorded in the follow-up `docs(v2): record commit SHA` commit)_

Final `git status --short` (after the feat commit + workpack:complete commit, before the SHA
follow-up):

```
(clean — see the SHA-recording follow-up commit for the post-completion clean slate)
```
