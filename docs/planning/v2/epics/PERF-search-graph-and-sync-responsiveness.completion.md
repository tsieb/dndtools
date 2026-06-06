# PERF-search-graph-and-sync-responsiveness — Completion Evidence

Epic: `PERF-search-graph-and-sync-responsiveness` — PERF: Search, graph, and sync responsiveness
Requirement IDs: PERF-004, PERF-008
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync &
Offline Model)

Workpack status: `complete`

This epic delivers search, graph, and sync responsiveness as PURE Processing-Core policy that COMPOSES
the PERF infrastructure the prior PERF epics already built — it does NOT invent a parallel grader, a
parallel set of budgets, or a parallel freshness convention:

- It MEASURES a search query, a graph/search incremental index update, and a sync reconciliation replay
  against the budgets the PERF-001 registry ALREADY owns
  (`apps/v2/packages/core/src/perf/budget-registry.ts` — `search`, `graph-indexing`,
  `sync-reconciliation`), through the existing PERF-007 `measureBudget` API
  (`apps/v2/packages/core/src/perf/measurement.ts`). There is exactly one measurement API in the
  codebase; every search/graph/sync grade flows through it and inherits its fail-closed semantics
  (unknown-budget → `error`; no-samples → `unknown`; exactly-at-threshold → pass). This mirrors how
  `perf/scene-map-render.ts` (PERF-002/003) and `perf/bundle-budget.ts` (PERF-005) compose the same
  registry + grader.
- It adds PURE, DETERMINISTIC COST MODELS the measurement consumes: an index-update cost model
  (`estimateIndexUpdateCost`) where an INCREMENTAL one-changed-note update costs far less than a FULL
  recompute over the whole vault and the two are measured DISTINCTLY; a search-query cost model
  (`estimateSearchQueryCost`) over an index of N records; and a sync-reconciliation cost model
  (`estimateReconciliationCost`) over an op-batch of N operations.
- It COMPOSES the surfaces it measures rather than re-deriving their state: the stale/partial INDICATORS
  come straight from the SRCH index freshness model (`state/search-index.ts` —
  `publishDomainFreshness`) and the GRAPH-005 incremental graph engine (`state/graph-index.ts` —
  `publishGraphFreshness` / `graphRepairSignal`), so a search/navigation that runs while background
  indexing is incomplete reports `partial`/`stale` WITHOUT blocking the cached results that DO exist and
  WITHOUT a parallel freshness convention.

All new logic is deterministic over plain data — no DOM, no worker, no `setTimeout`/`requestIdleCallback`,
no clock, no entropy, no network. Every size, sample, complexity, checkpoint, and flag is an EXPLICIT
input. The module lives in `@dndtools/v2-core`, imports no Svelte/DOM/platform/v1-runtime code (only
type-only + pure-function imports from `perf/budget-registry`, `perf/measurement`, `state/search-index`,
and `state/graph-index`), and boundary lint stays green.

Per ADR-014, LIVE timing capture is DEFERRED: this owns the DECLARED budgets + the DETERMINISTIC cost
models (sizes/samples as explicit inputs) + the resumable-batch plan + the breach reporting. A
background scheduler/indexer/replay feeds REAL durations (real indexer/replay times, real concurrent
foreground latencies) into the SAME `measureBudget` later — exactly as `measureBudget` already takes
sample timings as explicit inputs. This is stated as a known/deferred gap below.

## Demo (programmatic)

The capability is exercised through the Processing Core's public surface (`@dndtools/v2-core`). A
reviewer can see the behavior by running the targeted test file
(`apps/v2/packages/core/tests/perf-search-graph-sync.test.ts`), or in a REPL:

```ts
import {
  measureIndexUpdate,
  measureSearchQuery,
  reportSearchResponsiveness,
  reportGraphNavigation,
  measureReconciliation,
  measureForegroundDuringBackgroundWork,
  planBatchResumption,
} from '@dndtools/v2-core';

// PERF-004 AC1 — an INCREMENTAL one-changed-note update over a 10,000-record vault stays under the
// 500ms affected-node budget; a FULL recompute over the same vault BREACHES it (the path PERF-004 avoids).
measureIndexUpdate({ totalRecords: 10_000, changedRecords: 1, affectedEdges: 12 }, 'incremental').measurement.result; // 'pass'
measureIndexUpdate({ totalRecords: 10_000, changedRecords: 10_000, affectedEdges: 5_000 }, 'full-recompute').measurement.result; // 'breach'

// PERF-004 AC2 — a search over an index that background indexing is still catching up to reports
// `partial` and `resultsComplete: false`, but the cached results are STILL measured/returned (never blocked).
const report = reportSearchResponsiveness(
  { domain: 'note', indexedCursor: { sequence: 3, revision: 3, updatedAt: null }, sourceCursor: { sequence: 7, revision: 7, updatedAt: null }, available: true },
  { indexedRecords: 1_000, returnedResults: 20, facetCount: 1 },
);
report.freshness.status; // 'partial'
report.resultsComplete;   // false
report.measurement.result; // 'pass' (results still measured/returned)

// PERF-008 AC1 — a 1,000-op reconciliation stays under the 2s budget; a concurrent foreground search
// captured WHILE a reindex ran is graded against ITS OWN (`search`) budget, not the background work's.
measureReconciliation({ queuedOperations: 1_000, deferredOperations: 0, conflictingOperations: 0 }).measurement.result; // 'pass'
measureForegroundDuringBackgroundWork('search', [40, 55, 60, 80, 120]).result; // 'pass'

// PERF-008 AC2 — an interrupted batch resumes from its checkpoint; a missing/untrustworthy checkpoint
// restarts with a visible diagnostic (fail closed — never resume from an unknown point).
planBatchResumption('reindex-1', 1_000, { batchId: 'reindex-1', processedItems: 600, totalItems: 1_000 }).action; // 'resume'
planBatchResumption('reindex-1', 1_000, null).restartReason; // 'no-checkpoint'
```

## Requirement coverage / traceability

### PERF-004 — Graph and search indexing: incremental, source-aware algorithms + background scheduling

Story PERF-004-S01.

- AC1: "a large vault receives one changed note … navigation and search remain responsive."
  - Code: `estimateIndexUpdateCost` / `measureIndexUpdate` in
    `apps/v2/packages/core/src/perf/search-graph-sync.ts`. An `incremental` update reparses ONLY the
    changed records + their affected fan-out (cost scales with the change, INDEPENDENT of the vault
    size); a `full-recompute` reparses every record (cost scales with the vault). Both grade against
    the registry-owned `graph-indexing` (`< 500ms`) budget via `measureBudget`, so a regression that
    falls back to a full recompute on a large vault BREACHES the affected-node budget rather than being
    silently re-budgeted. `estimateSearchQueryCost` / `measureSearchQuery` grade a cached query against
    the `search` (`< 250ms p95`) budget.
  - Tests: `apps/v2/packages/core/tests/perf-search-graph-sync.test.ts` —
    "an INCREMENTAL one-changed-note update … costs far less than a FULL recompute", "the incremental
    cost is INDEPENDENT of the number of unchanged records", "the FULL recompute reparses every record",
    "an incremental one-changed-note update over a large vault PASSES the 500ms … budget", "a FULL
    recompute over a very large vault BREACHES the same budget", "both incremental and full recompute
    grade against the SAME graph-indexing budget", "EXACTLY at the budget ceiling PASSES", "a
    10,000-record cached query PASSES the 250ms p95 search budget", "a pathologically large index
    BREACHES the search budget".
- AC2: "background indexing is incomplete … stale/partial status is visible without returning hidden
  data."
  - Code: `reportSearchResponsiveness` (composes the SRCH `publishDomainFreshness`) and
    `reportGraphNavigation` (composes the GRAPH-005 `publishGraphFreshness` / `graphRepairSignal`) in
    `search-graph-sync.ts`. A search/navigation over an index/graph that is behind reports
    `partial`/`stale` and `resultsComplete`/`navigable: false` — but the cached results are STILL
    measured and returned (never blocked). The freshness is computed by the SRCH/GRAPH models, fed only
    the actor's visible index, so the indicator can never reveal hidden data.
  - Tests: "a FRESH index reports resultsComplete: true", "when background indexing is INCOMPLETE …
    the status is partial and results still return", "an UNAVAILABLE source forces stale (fail closed)
    but still returns cached results", "a healthy graph is navigable with no reindex required", "a
    STALE graph (incremental update failed) … requires a reindex", "an UNAVAILABLE graph source
    requires a reindex with the source-unavailable reason".

### PERF-008 — Search/graph/sync background work: scheduling, cancellation, resumable batches, indicators

Story PERF-008-S02.

- AC1: "a large vault reindex is running … the command remains within the configured responsiveness
  budget."
  - Code: `estimateReconciliationCost` / `measureReconciliation` grade an op-batch replay against the
    `sync-reconciliation` (`< 2s p95`) budget. `measureForegroundDuringBackgroundWork` /
    `foregroundBudgetIdFor` grade a CONCURRENT foreground command (search → `search`, navigate →
    `graph-indexing`, advance-combat → `widget-update`) against ITS OWN budget while background work
    runs — a PASS proves the background work stayed off the foreground's critical path; a BREACH names
    the foreground command was pushed over its budget. Background work never re-budgets the foreground.
  - Tests: "a 1,000-op clean batch PASSES the 2s reconciliation budget", "a pathologically large
    backlog BREACHES the reconciliation budget", "deferred and conflicting operations add EXTRA cost",
    "maps each foreground command kind to its own responsiveness budget", "a search captured DURING a
    reindex that stays under 250ms p95 PASSES", "a combat advance pushed OVER its 100ms widget-update
    budget … is a BREACH", "an EMPTY foreground sample set is unknown", "exactly AT the foreground
    budget threshold PASSES".
- AC2: "background work is cancelled or interrupted … it continues from a checkpoint or restarts with a
  visible diagnostic."
  - Code: `planBatchResumption` in `search-graph-sync.ts`. A valid mid-progress checkpoint RESUMES from
    the processed count (only the remaining items re-processed — no work lost or double-applied); a
    missing checkpoint, a checkpoint from a different batch, or a corrupt/total-disagreeing checkpoint
    RESTARTS with a fail-closed `restartReason` surfaced as a visible diagnostic; a complete checkpoint
    is `already-complete`. The checkpoint carries no content (counts + ids only), so it never leaks.
  - Tests: "a valid mid-progress checkpoint RESUMES from the processed count", "NO checkpoint RESTARTS
    … with a visible no-checkpoint diagnostic", "a checkpoint for a DIFFERENT batch RESTARTS", "a
    CORRUPT checkpoint (processed > total) RESTARTS", "a checkpoint whose total DISAGREES with the batch
    total RESTARTS", "a checkpoint at processed == total is ALREADY-COMPLETE", "an empty batch (total 0)
    … is already-complete".

### Determinism + composition

- Determinism tests for every model/report ("is deterministic — identical … yields an identical …"),
  proving identical sizes/samples/complexity/checkpoints produce identical pass/breach/plan results.
- Composition tests ("the canonical PERF registry owns every budget, fail closed") prove the three
  budget ids are registry-owned and owned by Search / Graph / Sync respectively, that every foreground
  budget id resolves to a registry-owned budget (no dangling id), and that grading against a registry
  that does not own the id is an `error` (fail closed) for search/index/reconciliation alike, never a
  silent pass.

## Tests run / quality gates

- `pnpm --filter @dndtools/v2-core test` — PASS (177 files, 2677 tests). Includes the new
  `apps/v2/packages/core/tests/perf-search-graph-sync.test.ts` (46 tests).
- `pnpm --filter @dndtools/v2-app test` — PASS (13 files, 65 tests).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings,
  877 files).
- `pnpm v2:lint` (boundary) — PASS ("v2 boundary lint passed").
- `pnpm lint` (full eslint + nav + tokens + repo audit) — PASS.
- `pnpm docs:validate` — PASS ("docs validation passed").
- `pnpm v2:workpack:validate` — PASS ("v2 workpack validation passed").
- `pnpm v2:gates` — PASS ("quality-gate check passed: 7 gate(s) owned, budgeted, and wired").
- Playwright e2e — SKIPPED, justified: this change is genuinely pure-core. The only non-generated files
  touched are `apps/v2/packages/core/src/perf/search-graph-sync.ts` (new),
  `apps/v2/packages/core/src/index.ts` (added exports), and the new core test. No route, layout, Svelte
  component, canvas-runtime, or any visible-flow file was touched, so the rendered desktop / mobile e2e
  flows are unaffected.

## Changed files (full repo-relative paths)

New:

- `apps/v2/packages/core/src/perf/search-graph-sync.ts`
- `apps/v2/packages/core/tests/perf-search-graph-sync.test.ts`
- `docs/planning/v2/epics/PERF-search-graph-and-sync-responsiveness.completion.md`

Modified:

- `apps/v2/packages/core/src/index.ts` (export the new search/graph/sync cost models + measurement surface)
- `docs/planning/v2/epics/PERF-search-graph-and-sync-responsiveness.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — metrics)
- `docs/planning/v2/workpack-state.yaml` (epic status active → complete)

## Known gaps / deferred items

- LIVE timing capture is DEFERRED per ADR-014. This epic owns the declared budgets + the deterministic
  cost models (sizes/samples as explicit inputs) + the resumable-batch plan + the breach reporting. A
  background scheduler/indexer/replay feeds REAL indexer/replay durations and REAL concurrent foreground
  latencies into the SAME `measureBudget` later. No live background-work profiler or worker scheduler is
  wired into a route in this epic.
- The cost models (`DEFAULT_INDEX_UPDATE_COST_MODEL`, `DEFAULT_SEARCH_QUERY_COST_MODEL`,
  `DEFAULT_RECONCILIATION_COST_MODEL`) are provisional per-unit estimates, not measured baselines —
  consistent with the registry budgets all being `provisional` per ADR-014. They are explicit, tunable
  inputs so a measured baseline replaces them without an API change.
- No GUI surface is added in this epic (pure Processing-Core policy). Wiring a real background scheduler
  to feed real samples/checkpoints into these measurements/plans is a separate integration step. The
  stale/partial freshness this epic reports already has GUI surfaces in the SRCH/GRAPH epics it composes.

## Git evidence

- Branch: `epic/PERF-search-graph-and-sync-responsiveness` (created from the prior epic tip HEAD
  `a0d27a1`).
- Commits on this branch:
  - `cc652cf` — `feat(v2): complete PERF-search-graph-and-sync-responsiveness epic` (code + tests +
    completion evidence).
  - `05edc20` — `docs(v2): mark PERF-search-graph-and-sync-responsiveness complete` (regenerated
    planning files).
  - This `docs(v2): record commit SHA …` commit records these SHAs in this evidence file.

Final `git status --short` (after the completion commits) is empty (clean slate):

```
```
