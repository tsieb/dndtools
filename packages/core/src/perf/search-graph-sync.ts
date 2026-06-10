/**
 * PERF-004 / PERF-008 — SEARCH, GRAPH, AND SYNC RESPONSIVENESS COST MODELS + MEASUREMENT (Architecture
 * Contract 1 Processing/Display decoupling; Contract 2 Cloud Sync & Offline Model; Vision algorithmic
 * approaches; Feature Inventory I3). This is the SEARCH / GRAPH / SYNC RESPONSIVENESS half of the PERF
 * capability branch. Like {@link ./scene-map-render} (PERF-002/003) and {@link ./bundle-budget}
 * (PERF-005), it COMPOSES the PERF-001 budget registry + PERF-007 measurement
 * ({@link ./budget-registry}, {@link ./measurement}) rather than inventing a parallel grader: a search
 * query latency, a graph/search INCREMENTAL index update, and a sync RECONCILIATION replay are graded
 * by the SAME deterministic {@link measureBudget} against the budgets the registry ALREADY owns
 * (`search`, `graph-indexing`, `sync-reconciliation`). There is exactly one measurement API in the
 * codebase, and exactly one set of declared budgets.
 *
 * It also COMPOSES the surfaces it measures rather than re-deriving their state:
 *
 *   - the SRCH index FRESHNESS model (`state/search-index.ts`) — `domainFreshnessStatus` /
 *     `publishDomainFreshness` decide whether cached results are `fresh`/`partial`/`stale`/`unknown`;
 *   - the GRAPH-005 incremental graph engine (`state/graph-index.ts`) — `graphFreshnessStatus` /
 *     `graphRepairSignal` decide whether a graph needs a reindex;
 *
 * so the stale/partial INDICATORS this module reports are exactly the ones those models already
 * publish (PERF-004 AC2 / PERF-008 AC2). There is NO parallel freshness convention.
 *
 * It adds the things PERF-004/008 need ON TOP of generic measurement:
 *
 *   PERF-004 — INCREMENTAL, SOURCE-AWARE INDEXING (a changed note leaves the vault navigable):
 *     1. A pure INDEX-UPDATE COST MODEL ({@link estimateIndexUpdateCost}) that turns an index update
 *        into a deterministic estimated duration as a function of HOW MUCH WORK it does. The keystone is
 *        that an INCREMENTAL update (one changed note → its affected fan-out) costs FAR less than a FULL
 *        RECOMPUTE over the whole index, and the two are measured DISTINCTLY (PERF-004 AC1). A full
 *        recompute pays per-record reparse cost over the WHOLE index; an incremental update pays only
 *        the changed records plus their affected reverse/fan-out edges.
 *     2. {@link measureIndexUpdate} grades that estimate against the `graph-indexing` budget; the
 *        incremental and full estimates grade against the SAME budget so a regression that silently
 *        falls back to a full recompute on a large vault BREACHES the affected-node-update budget.
 *     3. A pure SEARCH-QUERY COST MODEL ({@link estimateSearchQueryCost}) for a cached query over an
 *        index of N records, graded against the `search` budget by {@link measureSearchQuery}.
 *     4. {@link reportSearchResponsiveness} bundles the search measurement WITH the SRCH freshness
 *        status so a search that runs while background indexing is incomplete reports `partial`/`stale`
 *        WITHOUT blocking the cached results that DO exist (PERF-004 AC2 — composing the SRCH model).
 *
 *   PERF-008 — RESPONSIVE BACKGROUND WORK (scheduling, cancellation, resumable batches, indicators):
 *     1. A pure SYNC-RECONCILIATION COST MODEL ({@link estimateReconciliationCost}) for replaying a
 *        batch of N queued operations, graded against the `sync-reconciliation` budget by
 *        {@link measureReconciliation}.
 *     2. A FOREGROUND-RESPONSIVENESS check ({@link measureForegroundDuringBackgroundWork}): while a
 *        large reindex/replay runs in the background, a CONCURRENT foreground command (search, navigate,
 *        advance combat) must stay within ITS OWN budget. The model captures the budget rule that
 *        background work is SCHEDULED so it does not inflate the foreground command's latency past its
 *        budget — a foreground sample over its budget is a breach naming the background work (AC1).
 *     3. A RESUMABLE-BATCH / CHECKPOINT model ({@link planBatchResumption}): when background work is
 *        cancelled or interrupted, it either RESUMES from a recorded checkpoint (continuing the
 *        remaining items) or RESTARTS with a visible diagnostic — never silently loses or double-applies
 *        work (AC2, fail closed).
 *
 * FAIL CLOSED, EVERYWHERE. An unmeasured search/graph/sync budget is `unknown` (un-proven), never a
 * confident pass — inherited directly from {@link measureBudget}. A large index/op-batch over its budget
 * is a breach; exactly-at-threshold passes (the registry budgets are inclusive). A foreground command
 * pushed over its budget by background work is a breach. A cancelled batch with NO usable checkpoint
 * RESTARTS with a diagnostic rather than resuming from an unknown point. A budget id no registry owns is
 * an `error`.
 *
 * Pure + deterministic: every size, sample, complexity, and checkpoint is an EXPLICIT input. No DOM, no
 * Node, no worker, no `setTimeout`/`requestIdleCallback`, no clock, no entropy. Per ADR-014 the LIVE
 * timing capture (real indexer/replay durations from a background worker, real foreground latencies) is
 * DEFERRED — the background scheduler feeds real numbers into the SAME {@link measureBudget} later; this
 * owns the declared budgets, the deterministic cost MODELS that estimate work from size/complexity, the
 * resumable-batch plan, and the measurement that grades both estimates and captured samples — exactly as
 * {@link measureBudget} already takes sample timings as explicit inputs.
 */

import type { SearchDomainFreshness, SearchDomainIndex } from '../state/search-index';
import { publishDomainFreshness } from '../state/search-index';
import type { GraphIndex, GraphRepairSignal } from '../state/graph-index';
import { graphRepairSignal, publishGraphFreshness } from '../state/graph-index';
import type { PerformanceBudget } from './budget-registry';
import { measureBudget, type BudgetMeasurement } from './measurement';

// ---------------------------------------------------------------------------------------------------
// The registry ids this module grades against. Kept as consts so the models, the measurements, and the
// tests share ONE source of truth and never drift from the budget-registry's declared ids.
// ---------------------------------------------------------------------------------------------------

/** The registry id of the cached-search latency budget (`< 250ms p95`, PERF-004/PERF-007). */
export const SEARCH_BUDGET_ID = 'search' as const;
/** The registry id of the affected-node graph-index update budget (`< 500ms`, PERF-004/PERF-007). */
export const GRAPH_INDEXING_BUDGET_ID = 'graph-indexing' as const;
/** The registry id of the sync-reconciliation local-replay budget (`< 2s p95`, PERF-008/PERF-007). */
export const SYNC_RECONCILIATION_BUDGET_ID = 'sync-reconciliation' as const;

// ===================================================================================================
// PERF-004 — INCREMENTAL, SOURCE-AWARE INDEX UPDATE COST MODEL + MEASUREMENT.
// ===================================================================================================

/**
 * How an index update was performed. The whole point of PERF-004 is that these two cost DIFFERENTLY and
 * are measured DISTINCTLY:
 *
 *   - `incremental` — only the records a single accepted change touches are reparsed, plus the dependent
 *     reverse/fan-out edges re-resolved. This is the `applyGraphChange`/`recordDomainMutation` path. Its
 *     cost scales with the CHANGE, not the vault.
 *   - `full-recompute` — the whole index is rebuilt over every record (the `buildGraphIndex` path used
 *     for a cold start or a forced reindex). Its cost scales with the WHOLE index, so on a large vault
 *     it is the expensive path PERF-004 avoids on the hot path.
 */
export type IndexUpdateMode = 'incremental' | 'full-recompute';

/**
 * The work an index update does, as the cost model sees it — derived from the GRAPH/SRCH engines'
 * notion of an update (a changed-record count + the affected fan-out) WITHOUT the model touching raw
 * markdown or the DOM. The caller maps an accepted change (or a full rebuild) to this shape.
 */
export interface IndexUpdateComplexity {
	/** The TOTAL number of records in the index (the size a full recompute must reparse). Non-negative. */
	readonly totalRecords: number;
	/**
	 * The number of records this update actually REPARSES. For `incremental` this is the changed records
	 * (typically 1 — "one changed note"); for `full-recompute` it is every record. Non-negative.
	 */
	readonly changedRecords: number;
	/**
	 * The number of dependent edges/backlinks the update must RE-RESOLVE (the changed records' fan-out —
	 * the reverse index entries that point at or from the changed records). Non-negative. For a full
	 * recompute this is the whole edge set; for an incremental update it is only the affected fan-out.
	 */
	readonly affectedEdges: number;
}

/** Tunable per-unit costs for the index-update model. Explicit so a test can pin them; defaults below. */
export interface IndexUpdateCostModel {
	/** Fixed scheduling/bookkeeping cost in ms, paid once per update regardless of size. */
	readonly baseMs: number;
	/** Cost in ms to REPARSE one record (the expensive markdown/field parse the incremental path avoids per unchanged record). */
	readonly perReparsedRecordMs: number;
	/** Cost in ms to RE-RESOLVE one dependent edge/backlink in the reverse index. */
	readonly perAffectedEdgeMs: number;
}

/** The default index-update cost model. Provisional per ADR-014 — real indexer timings replace these later. */
export const DEFAULT_INDEX_UPDATE_COST_MODEL: IndexUpdateCostModel = Object.freeze({
	baseMs: 5,
	perReparsedRecordMs: 0.4,
	perAffectedEdgeMs: 0.05,
});

/** Coerce a complexity count to a non-negative finite integer (a NaN/negative count contributes 0). */
function nonNegativeCount(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** A breakdown of the estimated index-update cost so a diagnostic shows WHERE the time goes. */
export interface IndexUpdateEstimate {
	/** The estimated update duration in ms (the value graded against `graph-indexing`). */
	readonly estimatedMs: number;
	/** The mode the estimate was computed for. */
	readonly mode: IndexUpdateMode;
	/** How many records were reparsed (the model's view of the reparse work paid). */
	readonly reparsedRecordCount: number;
	/** How many dependent edges were re-resolved. */
	readonly affectedEdgeCount: number;
}

/**
 * PERF-004 AC1 — estimate an index update's cost from its work, deterministically. The mode decides how
 * much work is paid:
 *
 *   - `incremental` reparses ONLY the changed records and re-resolves ONLY their affected fan-out, so a
 *     one-changed-note update over a 10,000-record vault costs `base + 1 reparse + (its fan-out)` —
 *     independent of the 10,000 unchanged records. This is "incremental, source-aware … so large vaults
 *     remain navigable during updates".
 *   - `full-recompute` reparses EVERY record and re-resolves the WHOLE edge set, so its cost scales with
 *     the vault. On a large vault this is far more expensive — which is exactly why the hot path is
 *     incremental and the two are graded against the SAME budget.
 *
 * For a `full-recompute` the model uses `totalRecords` as the reparse count regardless of `changedRecords`
 * (a full rebuild reparses everything); for an `incremental` update it uses `changedRecords` (clamped to
 * `totalRecords`, since you cannot reparse more records than exist). Pure + deterministic.
 */
export function estimateIndexUpdateCost(
	complexity: IndexUpdateComplexity,
	mode: IndexUpdateMode,
	model: IndexUpdateCostModel = DEFAULT_INDEX_UPDATE_COST_MODEL,
): IndexUpdateEstimate {
	const totalRecords = nonNegativeCount(complexity.totalRecords);
	const affectedEdges = nonNegativeCount(complexity.affectedEdges);
	const reparsedRecordCount =
		mode === 'full-recompute'
			? totalRecords
			: Math.min(nonNegativeCount(complexity.changedRecords), totalRecords);
	const estimatedMs =
		model.baseMs +
		model.perReparsedRecordMs * reparsedRecordCount +
		model.perAffectedEdgeMs * affectedEdges;
	return { estimatedMs, mode, reparsedRecordCount, affectedEdgeCount: affectedEdges };
}

/**
 * PERF-004 AC1 — measure an index update's estimated cost against the `graph-indexing` budget, fail
 * closed. Builds the estimate with {@link estimateIndexUpdateCost}, then grades the estimated ms through
 * the SAME {@link measureBudget} as every other PERF measurement (a `duration-ms` ceiling — a single slow
 * update breaches; exactly at the 500ms affected-node ceiling passes). Both an incremental and a full
 * recompute grade against the SAME budget, so a regression that falls back to a full recompute on a large
 * vault BREACHES the affected-node-update budget rather than being silently re-budgeted.
 *
 * `budgets` defaults to the canonical registry; pass a custom set to grade against a test budget.
 */
export function measureIndexUpdate(
	complexity: IndexUpdateComplexity,
	mode: IndexUpdateMode,
	options?: { model?: IndexUpdateCostModel; budgets?: readonly PerformanceBudget[] },
): { readonly measurement: BudgetMeasurement; readonly estimate: IndexUpdateEstimate } {
	const estimate = estimateIndexUpdateCost(complexity, mode, options?.model);
	const measurement = measureBudget(GRAPH_INDEXING_BUDGET_ID, [estimate.estimatedMs], options?.budgets);
	return { measurement, estimate };
}

// ---------------------------------------------------------------------------------------------------
// PERF-004 — SEARCH QUERY COST MODEL + RESPONSIVENESS (search WITH freshness status).
// ---------------------------------------------------------------------------------------------------

/** The work a cached search query does, as the cost model sees it. The caller maps a query to this. */
export interface SearchQueryComplexity {
	/** The number of indexed records the query scans/scores (the cached index size). Non-negative. */
	readonly indexedRecords: number;
	/** The number of result records the query returns (the slice it materializes). Non-negative. */
	readonly returnedResults: number;
	/** The number of active facet filters applied (each narrows but costs a little). Non-negative. */
	readonly facetCount: number;
}

/** Tunable per-unit costs for the search-query model. Explicit so a test can pin them; defaults below. */
export interface SearchQueryCostModel {
	/** Fixed query-planning cost in ms, paid once per query. */
	readonly baseMs: number;
	/** Cost in ms to scan/score one indexed record (the dominant term over a large index). */
	readonly perIndexedRecordMs: number;
	/** Cost in ms to materialize one returned result row. */
	readonly perReturnedResultMs: number;
	/** Cost in ms per active facet filter evaluated. */
	readonly perFacetMs: number;
}

/** The default search-query cost model. Provisional per ADR-014 — real query timings replace these later. */
export const DEFAULT_SEARCH_QUERY_COST_MODEL: SearchQueryCostModel = Object.freeze({
	baseMs: 3,
	perIndexedRecordMs: 0.015,
	perReturnedResultMs: 0.05,
	perFacetMs: 0.5,
});

/** A search-query cost estimate: the estimated ms graded against the `search` budget. */
export interface SearchQueryEstimate {
	/** The estimated query duration in ms (the value graded against `search`). */
	readonly estimatedMs: number;
	/** How many indexed records were scanned (the model's view of the scan work). */
	readonly scannedRecordCount: number;
}

/**
 * PERF-004 — estimate a cached search query's cost over an index of N records, deterministically. The
 * dominant term is the per-indexed-record scan, so the model's cost grows with the index size — which is
 * why a large vault needs the index to be incrementally maintained and the freshness signalled rather
 * than rebuilt synchronously on every query. Pure + deterministic.
 */
export function estimateSearchQueryCost(
	complexity: SearchQueryComplexity,
	model: SearchQueryCostModel = DEFAULT_SEARCH_QUERY_COST_MODEL,
): SearchQueryEstimate {
	const indexedRecords = nonNegativeCount(complexity.indexedRecords);
	const estimatedMs =
		model.baseMs +
		model.perIndexedRecordMs * indexedRecords +
		model.perReturnedResultMs * nonNegativeCount(complexity.returnedResults) +
		model.perFacetMs * nonNegativeCount(complexity.facetCount);
	return { estimatedMs, scannedRecordCount: indexedRecords };
}

/**
 * PERF-004 — measure a cached search query's estimated cost against the `search` budget (`< 250ms p95`),
 * fail closed. Grades the estimate through the SAME {@link measureBudget}; an empty/over-budget estimate
 * follows the standard fail-closed rules. `budgets` defaults to the canonical registry.
 */
export function measureSearchQuery(
	complexity: SearchQueryComplexity,
	options?: { model?: SearchQueryCostModel; budgets?: readonly PerformanceBudget[] },
): { readonly measurement: BudgetMeasurement; readonly estimate: SearchQueryEstimate } {
	const estimate = estimateSearchQueryCost(complexity, options?.model);
	const measurement = measureBudget(SEARCH_BUDGET_ID, [estimate.estimatedMs], options?.budgets);
	return { measurement, estimate };
}

/**
 * PERF-004 AC2 — a search response WITH its freshness status: the latency measurement PLUS whether the
 * cached index the results came from is `fresh`/`partial`/`stale`/`unknown`. When background indexing is
 * incomplete the status is `partial`/`stale` and the GUI shows it WITHOUT blocking the cached results
 * that DO exist (the requirement's "stale/partial status is visible without returning hidden data"). The
 * freshness is computed by the SRCH model, never re-derived here — and because the SRCH model carries no
 * content and is fed only the actor's visible index, the indicator can never reveal hidden data.
 */
export interface SearchResponsivenessReport {
	/** The cached-query latency verdict against the `search` budget. */
	readonly measurement: BudgetMeasurement;
	/** The cost estimate that was graded. */
	readonly estimate: SearchQueryEstimate;
	/** The SRCH freshness of the domain the results came from (status + cursors + behind-by). */
	readonly freshness: SearchDomainFreshness;
	/**
	 * Whether the results are KNOWN-COMPLETE (the index is `fresh`). When `false` the GUI must show the
	 * stale/partial indicator; the cached results still return (they are never blocked or hidden). This is
	 * `freshness.status === 'fresh'`, surfaced for the GUI without it re-checking the status enum.
	 */
	readonly resultsComplete: boolean;
}

/**
 * PERF-004 AC2 — report a search's responsiveness AND its result completeness together. Composes
 * {@link measureSearchQuery} (latency vs the `search` budget) with the SRCH index's
 * {@link publishDomainFreshness} (whether background indexing has caught up). A search over an index that
 * is behind reports `partial`/`stale` and `resultsComplete: false`, so the GUI surfaces the indicator —
 * but the cached results are still measured and returned (never blocked). Pure + deterministic — the
 * domain index and the query complexity are explicit inputs.
 */
export function reportSearchResponsiveness(
	domainIndex: SearchDomainIndex,
	complexity: SearchQueryComplexity,
	options?: { model?: SearchQueryCostModel; budgets?: readonly PerformanceBudget[] },
): SearchResponsivenessReport {
	const { measurement, estimate } = measureSearchQuery(complexity, options);
	const freshness = publishDomainFreshness(domainIndex);
	return {
		measurement,
		estimate,
		freshness,
		resultsComplete: freshness.status === 'fresh',
	};
}

/**
 * PERF-004 AC2 — the GRAPH navigation equivalent of {@link reportSearchResponsiveness}: a graph's
 * freshness + whether it needs a reindex, so navigation that runs while graph indexing is incomplete
 * shows a stale/partial indicator (and a required-reindex signal) WITHOUT serving a confidently-wrong
 * graph. Composes the GRAPH-005 {@link publishGraphFreshness} / {@link graphRepairSignal}; there is no
 * parallel graph-freshness convention. Pure.
 */
export interface GraphNavigationReport {
	/** The graph's freshness (status + cursors + behind-by), from the GRAPH-005 publisher. */
	readonly freshness: SearchDomainFreshness;
	/** Whether a full reindex/repair is required (and why), from the GRAPH-005 repair signal. */
	readonly repair: GraphRepairSignal;
	/** Whether the graph is KNOWN-COMPLETE (`fresh`); when `false` the GUI shows the stale/partial indicator. */
	readonly navigable: boolean;
}

/** PERF-004 AC2 — report a graph's navigation freshness + repair signal together. Pure + deterministic. */
export function reportGraphNavigation(index: GraphIndex): GraphNavigationReport {
	const freshness = publishGraphFreshness(index);
	const repair = graphRepairSignal(index);
	return { freshness, repair, navigable: freshness.status === 'fresh' };
}

// ===================================================================================================
// PERF-008 — SYNC RECONCILIATION COST + FOREGROUND RESPONSIVENESS + RESUMABLE BATCHES.
// ===================================================================================================

/** The work a sync reconciliation (operation-log replay) does, as the cost model sees it. */
export interface ReconciliationComplexity {
	/** The number of queued operations to replay/validate in this batch. Non-negative. */
	readonly queuedOperations: number;
	/**
	 * The number of operations that DEFER on an unsatisfied dependency and must be re-checked on a later
	 * pass (each adds re-validation work). Non-negative; <= `queuedOperations`.
	 */
	readonly deferredOperations: number;
	/**
	 * The number of operations that CONFLICT and need reconciliation (a more expensive merge/last-writer
	 * decision than a clean apply). Non-negative; <= `queuedOperations`.
	 */
	readonly conflictingOperations: number;
}

/** Tunable per-unit costs for the reconciliation model. Explicit so a test can pin them; defaults below. */
export interface ReconciliationCostModel {
	/** Fixed replay setup cost in ms, paid once per batch. */
	readonly baseMs: number;
	/** Cost in ms to validate + apply ONE clean operation. */
	readonly perOperationMs: number;
	/** EXTRA cost in ms to re-check ONE deferred operation on a later pass. */
	readonly perDeferredOperationMs: number;
	/** EXTRA cost in ms to reconcile ONE conflicting operation (merge/last-writer decision). */
	readonly perConflictMs: number;
}

/** The default reconciliation cost model. Provisional per ADR-014 — real replay timings replace these later. */
export const DEFAULT_RECONCILIATION_COST_MODEL: ReconciliationCostModel = Object.freeze({
	baseMs: 10,
	perOperationMs: 0.8,
	perDeferredOperationMs: 0.4,
	perConflictMs: 1.5,
});

/** A reconciliation cost estimate: the estimated ms graded against the `sync-reconciliation` budget. */
export interface ReconciliationEstimate {
	/** The estimated replay duration in ms (the value graded against `sync-reconciliation`). */
	readonly estimatedMs: number;
	/** How many operations were replayed (the model's view of the replay work). */
	readonly replayedOperationCount: number;
}

/**
 * PERF-008 — estimate a sync reconciliation's cost from its op-batch size, deterministically. The cost
 * scales with the queued-operation count plus the extra work deferred + conflicting operations cost. The
 * deferred/conflict counts are CLAMPED to the queued count (you cannot defer/conflict more ops than were
 * queued). This is the executable form of "1,000 queued operations … local replay without UI starvation"
 * — a batch over budget is the signal to SCHEDULE/CHUNK the replay so the foreground stays responsive.
 * Pure + deterministic.
 */
export function estimateReconciliationCost(
	complexity: ReconciliationComplexity,
	model: ReconciliationCostModel = DEFAULT_RECONCILIATION_COST_MODEL,
): ReconciliationEstimate {
	const queued = nonNegativeCount(complexity.queuedOperations);
	const deferred = Math.min(nonNegativeCount(complexity.deferredOperations), queued);
	const conflicting = Math.min(nonNegativeCount(complexity.conflictingOperations), queued);
	const estimatedMs =
		model.baseMs +
		model.perOperationMs * queued +
		model.perDeferredOperationMs * deferred +
		model.perConflictMs * conflicting;
	return { estimatedMs, replayedOperationCount: queued };
}

/**
 * PERF-008 — measure a sync reconciliation's estimated cost against the `sync-reconciliation` budget
 * (`< 2s p95`), fail closed. Grades the estimate through the SAME {@link measureBudget}; a 1,000-op batch
 * over the 2s ceiling is a breach, exactly at the ceiling passes, an empty estimate is graded normally
 * (an empty batch still pays the base setup). `budgets` defaults to the canonical registry.
 */
export function measureReconciliation(
	complexity: ReconciliationComplexity,
	options?: { model?: ReconciliationCostModel; budgets?: readonly PerformanceBudget[] },
): { readonly measurement: BudgetMeasurement; readonly estimate: ReconciliationEstimate } {
	const estimate = estimateReconciliationCost(complexity, options?.model);
	const measurement = measureBudget(
		SYNC_RECONCILIATION_BUDGET_ID,
		[estimate.estimatedMs],
		options?.budgets,
	);
	return { measurement, estimate };
}

// ---------------------------------------------------------------------------------------------------
// PERF-008 AC1 — FOREGROUND RESPONSIVENESS while background work runs.
// ---------------------------------------------------------------------------------------------------

/**
 * The kind of foreground command that must stay responsive while background work runs. Each maps to its
 * OWN responsiveness budget so the foreground command is graded against the budget that governs IT — a
 * search against `search`, navigation against `graph-indexing` (the affected-node update that keeps
 * navigation current), a combat advance against `widget-update` (the visible-update latency a session
 * command feels). Background work never re-budgets the foreground command.
 */
export type ForegroundCommandKind = 'search' | 'navigate' | 'advance-combat';

/** Resolve the responsiveness budget id a foreground command is graded against. */
export function foregroundBudgetIdFor(kind: ForegroundCommandKind): string {
	switch (kind) {
		case 'search':
			return SEARCH_BUDGET_ID;
		case 'navigate':
			return GRAPH_INDEXING_BUDGET_ID;
		case 'advance-combat':
			// A combat advance is a visible widget update; it is governed by the widget-update latency budget.
			return 'widget-update';
	}
}

/**
 * PERF-008 AC1 — measure a CONCURRENT foreground command's latency against its own budget WHILE a large
 * background reindex/replay runs, fail closed. The samples are the foreground command's OBSERVED (or
 * estimated) latencies CAPTURED while the background work was in flight; the verdict is graded against
 * the foreground command's own budget ({@link foregroundBudgetIdFor}). The background work is SCHEDULED
 * so it does not inflate the foreground latency past its budget — so a PASS proves the background work
 * stayed off the foreground's critical path, and a BREACH names that the foreground command was pushed
 * over budget (the report's message names the owning budget). An empty sample set is `unknown` (un-proven,
 * not a confident pass). Pure + deterministic — the samples are explicit inputs.
 *
 * `budgets` defaults to the canonical registry; pass a custom set to grade against a test budget.
 */
export function measureForegroundDuringBackgroundWork(
	kind: ForegroundCommandKind,
	foregroundLatencyMsSamples: readonly number[],
	budgets?: readonly PerformanceBudget[],
): BudgetMeasurement {
	return measureBudget(foregroundBudgetIdFor(kind), foregroundLatencyMsSamples, budgets);
}

// ---------------------------------------------------------------------------------------------------
// PERF-008 AC2 — RESUMABLE BATCHES: cancel/interrupt → resume from checkpoint, or restart with diagnostic.
// ---------------------------------------------------------------------------------------------------

/**
 * A CHECKPOINT recorded by background work so it can be resumed after cancellation/interruption. It names
 * how far the work got (a monotonic processed count) over a total, plus the batch identity it belongs to,
 * so a resume can verify the checkpoint matches the batch it is resuming and continue from the right
 * point. It carries NO content — only counts and ids — so it never leaks vault data.
 */
export interface BackgroundWorkCheckpoint {
	/** The id of the batch this checkpoint belongs to (a resume must match it to be usable). Non-empty. */
	readonly batchId: string;
	/** The total number of items the batch must process. Non-negative. */
	readonly totalItems: number;
	/** How many items had been processed when the checkpoint was recorded. Non-negative; <= totalItems. */
	readonly processedItems: number;
}

/** What a resume should do after a cancellation/interruption. */
export type BatchResumptionAction =
	/** Continue from the checkpoint — only the remaining items are re-processed (no work lost or repeated). */
	| 'resume'
	/** Restart from the beginning — the checkpoint is missing/unusable; a visible diagnostic is shown. */
	| 'restart'
	/** Nothing to do — the batch had already finished before it was interrupted. */
	| 'already-complete';

/** Why a batch must RESTART rather than resume (the fail-closed reason, surfaced as a visible diagnostic). */
export type BatchRestartReason =
	/** No checkpoint was recorded (the work was interrupted before its first checkpoint). */
	| 'no-checkpoint'
	/** The checkpoint belongs to a DIFFERENT batch (its id does not match) — it cannot be trusted to resume. */
	| 'checkpoint-batch-mismatch'
	/** The checkpoint's counts are invalid (negative, non-finite, or processed > total) — it cannot be trusted. */
	| 'checkpoint-corrupt';

/**
 * A resumption plan for an interrupted batch. On `resume` it names exactly which items remain so the work
 * continues from the checkpoint; on `restart` it names a fail-closed `restartReason` the GUI shows as a
 * visible diagnostic; on `already-complete` there is nothing to do.
 */
export interface BatchResumptionPlan {
	/** What to do. */
	readonly action: BatchResumptionAction;
	/** The item index (0-based) to resume FROM on `resume` (== checkpoint.processedItems); 0 on restart. */
	readonly resumeFromIndex: number;
	/** How many items remain to process (total − processed on resume; total on restart; 0 when complete). */
	readonly remainingItems: number;
	/** The fail-closed reason on `restart`; `null` otherwise. */
	readonly restartReason: BatchRestartReason | null;
	/** A non-leaking diagnostic the GUI can show (counts + reason only, never content). */
	readonly message: string;
}

/** Whether a checkpoint's counts are well-formed (finite, non-negative integers, processed <= total). */
function checkpointCountsValid(checkpoint: BackgroundWorkCheckpoint): boolean {
	const { totalItems, processedItems } = checkpoint;
	return (
		Number.isFinite(totalItems) &&
		Number.isFinite(processedItems) &&
		Number.isInteger(totalItems) &&
		Number.isInteger(processedItems) &&
		totalItems >= 0 &&
		processedItems >= 0 &&
		processedItems <= totalItems
	);
}

/**
 * PERF-008 AC2 — plan how to resume an interrupted batch, FAILING CLOSED. Given the batch identity + total
 * and the LAST recorded checkpoint (or `null` if none was recorded before the interruption):
 *
 *   - NO checkpoint ⇒ `restart` with reason `no-checkpoint` and a visible diagnostic — the work restarts
 *     from the beginning rather than resuming from an unknown point (fail closed: never silently skip).
 *   - a checkpoint for a DIFFERENT batch ⇒ `restart` / `checkpoint-batch-mismatch` — a stale checkpoint
 *     from another batch can't be trusted to resume THIS one.
 *   - a checkpoint with CORRUPT counts (negative / non-finite / processed > total) ⇒ `restart` /
 *     `checkpoint-corrupt` — an untrustworthy checkpoint restarts rather than resuming wrongly.
 *   - a VALID checkpoint whose `processedItems` equals `totalItems` ⇒ `already-complete` (nothing to do —
 *     the batch had finished; resuming would re-do nothing).
 *   - otherwise ⇒ `resume` from `processedItems`, re-processing only the `total − processed` remaining
 *     items, so no item is lost or double-applied (the checkpoint is the exactly-once boundary).
 *
 * The `total` argument is the batch's authoritative total; a valid checkpoint's `totalItems` must match it
 * (a mismatch is treated as `checkpoint-corrupt` — the checkpoint disagrees with the batch about its size,
 * so it cannot be trusted). Pure + deterministic — the checkpoint and total are explicit inputs.
 */
export function planBatchResumption(
	batchId: string,
	total: number,
	checkpoint: BackgroundWorkCheckpoint | null,
): BatchResumptionPlan {
	const safeTotal = nonNegativeCount(total);

	if (checkpoint === null) {
		return {
			action: 'restart',
			resumeFromIndex: 0,
			remainingItems: safeTotal,
			restartReason: 'no-checkpoint',
			message: `No checkpoint was recorded for batch "${batchId}"; restarting from the beginning (${safeTotal} item(s)) with a visible diagnostic (PERF-008 AC2 fail-closed).`,
		};
	}

	if (checkpoint.batchId !== batchId) {
		return {
			action: 'restart',
			resumeFromIndex: 0,
			remainingItems: safeTotal,
			restartReason: 'checkpoint-batch-mismatch',
			message: `The checkpoint belongs to a different batch ("${checkpoint.batchId}", not "${batchId}"); restarting "${batchId}" with a visible diagnostic (PERF-008 AC2 fail-closed).`,
		};
	}

	if (!checkpointCountsValid(checkpoint) || checkpoint.totalItems !== safeTotal) {
		return {
			action: 'restart',
			resumeFromIndex: 0,
			remainingItems: safeTotal,
			restartReason: 'checkpoint-corrupt',
			message: `The checkpoint for batch "${batchId}" is corrupt or disagrees with the batch total; restarting with a visible diagnostic (PERF-008 AC2 fail-closed).`,
		};
	}

	const remainingItems = checkpoint.totalItems - checkpoint.processedItems;
	if (remainingItems === 0) {
		return {
			action: 'already-complete',
			resumeFromIndex: checkpoint.processedItems,
			remainingItems: 0,
			restartReason: null,
			message: `Batch "${batchId}" had already processed all ${checkpoint.totalItems} item(s) before interruption; nothing to resume.`,
		};
	}

	return {
		action: 'resume',
		resumeFromIndex: checkpoint.processedItems,
		remainingItems,
		restartReason: null,
		message: `Resuming batch "${batchId}" from item ${checkpoint.processedItems} of ${checkpoint.totalItems}; ${remainingItems} item(s) remain (PERF-008 AC2).`,
	};
}
