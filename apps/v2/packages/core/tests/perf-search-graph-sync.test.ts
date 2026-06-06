import { describe, expect, it } from 'vitest';
import {
	DEFAULT_INDEX_UPDATE_COST_MODEL,
	DEFAULT_RECONCILIATION_COST_MODEL,
	DEFAULT_SEARCH_QUERY_COST_MODEL,
	GRAPH_INDEXING_BUDGET_ID,
	PERFORMANCE_BUDGETS,
	SEARCH_BUDGET_ID,
	SYNC_RECONCILIATION_BUDGET_ID,
	budgetForId,
	buildGraphIndex,
	estimateIndexUpdateCost,
	estimateReconciliationCost,
	estimateSearchQueryCost,
	foregroundBudgetIdFor,
	markGraphStale,
	measureForegroundDuringBackgroundWork,
	measureIndexUpdate,
	measureReconciliation,
	measureSearchQuery,
	planBatchResumption,
	reportGraphNavigation,
	reportSearchResponsiveness,
	setGraphAvailability,
	type BackgroundWorkCheckpoint,
	type GraphNodeRecord,
	type IndexUpdateComplexity,
	type PerformanceBudget,
	type SearchDomainIndex,
	type SearchIndexCursor,
} from '../src/index';

// A custom 1ms-ceiling graph-indexing budget for landing estimates exactly on a threshold without
// needing an enormous fixture; mirrors the scene-map-render tests' "tuned model" approach.
function tinyGraphBudget(targetMs: number): PerformanceBudget {
	const canonical = budgetForId(GRAPH_INDEXING_BUDGET_ID)!;
	return { ...canonical, metric: { ...canonical.metric, target: targetMs } };
}

// ===================================================================================================
// PERF-004 AC1 — incremental, source-aware index update cost: incremental << full recompute (distinct).
// ===================================================================================================

describe('PERF-004 AC1 estimateIndexUpdateCost — incremental vs full recompute are measured distinctly', () => {
	// A 10,000-record vault, one changed note touching a small fan-out (the requirement's exact fixture).
	const largeVault: IndexUpdateComplexity = {
		totalRecords: 10_000,
		changedRecords: 1,
		affectedEdges: 8,
	};

	it('an INCREMENTAL one-changed-note update over a 10,000-record vault costs far less than a FULL recompute', () => {
		const incremental = estimateIndexUpdateCost(largeVault, 'incremental');
		const full = estimateIndexUpdateCost(largeVault, 'full-recompute');
		// Incremental reparses ONLY the 1 changed record; full reparses all 10,000.
		expect(incremental.reparsedRecordCount).toBe(1);
		expect(full.reparsedRecordCount).toBe(10_000);
		expect(incremental.estimatedMs).toBeLessThan(full.estimatedMs);
		// The dividend is large: incremental is a tiny fraction of the full recompute cost.
		expect(incremental.estimatedMs).toBeLessThan(full.estimatedMs / 100);
	});

	it('the incremental cost is INDEPENDENT of the number of unchanged records (it scales with the change, not the vault)', () => {
		const small = estimateIndexUpdateCost({ totalRecords: 100, changedRecords: 1, affectedEdges: 8 }, 'incremental');
		const huge = estimateIndexUpdateCost({ totalRecords: 1_000_000, changedRecords: 1, affectedEdges: 8 }, 'incremental');
		// Same change, vastly different vault size → same incremental cost (the unchanged records cost nothing).
		expect(huge.estimatedMs).toBe(small.estimatedMs);
	});

	it('the FULL recompute reparses every record regardless of changedRecords (a full rebuild reparses everything)', () => {
		const full = estimateIndexUpdateCost({ totalRecords: 500, changedRecords: 1, affectedEdges: 0 }, 'full-recompute');
		expect(full.reparsedRecordCount).toBe(500);
		expect(full.estimatedMs).toBe(
			DEFAULT_INDEX_UPDATE_COST_MODEL.baseMs + DEFAULT_INDEX_UPDATE_COST_MODEL.perReparsedRecordMs * 500,
		);
	});

	it('clamps the incremental changed-record count to the total (cannot reparse more records than exist)', () => {
		const clamped = estimateIndexUpdateCost({ totalRecords: 3, changedRecords: 99, affectedEdges: 0 }, 'incremental');
		expect(clamped.reparsedRecordCount).toBe(3);
	});

	it('coerces negative/NaN counts to 0 (no negative cost)', () => {
		const weird = estimateIndexUpdateCost(
			{ totalRecords: Number.NaN, changedRecords: -5, affectedEdges: -1 },
			'incremental',
		);
		expect(weird.estimatedMs).toBe(DEFAULT_INDEX_UPDATE_COST_MODEL.baseMs);
		expect(weird.reparsedRecordCount).toBe(0);
		expect(weird.affectedEdgeCount).toBe(0);
	});

	it('is deterministic — identical complexity + mode yields an identical estimate', () => {
		expect(estimateIndexUpdateCost(largeVault, 'incremental')).toEqual(
			estimateIndexUpdateCost({ ...largeVault }, 'incremental'),
		);
	});
});

describe('PERF-004 AC1 measureIndexUpdate — grade against the graph-indexing budget, fail closed', () => {
	it('an incremental one-changed-note update over a large vault PASSES the 500ms affected-node budget', () => {
		const { measurement } = measureIndexUpdate(
			{ totalRecords: 10_000, changedRecords: 1, affectedEdges: 12 },
			'incremental',
		);
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(GRAPH_INDEXING_BUDGET_ID);
	});

	it('a FULL recompute over a very large vault BREACHES the same budget (adversarial — the path PERF-004 avoids)', () => {
		// 10,000 records reparsed at 0.4ms each = 4,000ms+, well over the 500ms ceiling.
		const { measurement, estimate } = measureIndexUpdate(
			{ totalRecords: 10_000, changedRecords: 10_000, affectedEdges: 5_000 },
			'full-recompute',
		);
		expect(estimate.estimatedMs).toBeGreaterThan(500);
		expect(measurement.result).toBe('breach');
		expect(measurement.message).toContain('Graph'); // the owning domain is named on a breach
	});

	it('both incremental and full recompute grade against the SAME graph-indexing budget (no silent re-budgeting)', () => {
		const inc = measureIndexUpdate({ totalRecords: 100, changedRecords: 1, affectedEdges: 1 }, 'incremental');
		const full = measureIndexUpdate({ totalRecords: 100, changedRecords: 100, affectedEdges: 50 }, 'full-recompute');
		expect(inc.measurement.budget?.id).toBe(GRAPH_INDEXING_BUDGET_ID);
		expect(full.measurement.budget?.id).toBe(GRAPH_INDEXING_BUDGET_ID);
	});

	it('EXACTLY at the budget ceiling PASSES (inclusive) — a tuned model lands the estimate on the threshold', () => {
		// A model whose base alone equals a 1ms ceiling, no records/edges → estimate exactly 1ms.
		const { measurement, estimate } = measureIndexUpdate(
			{ totalRecords: 0, changedRecords: 0, affectedEdges: 0 },
			'incremental',
			{
				model: { baseMs: 1, perReparsedRecordMs: 0.4, perAffectedEdgeMs: 0.05 },
				budgets: [tinyGraphBudget(1)],
			},
		);
		expect(estimate.estimatedMs).toBe(1);
		expect(measurement.result).toBe('pass');
		expect(measurement.marginToTarget).toBe(0);
	});

	it('grading against a registry that does NOT own the id is an error (fail closed), never a silent pass', () => {
		const { measurement } = measureIndexUpdate(
			{ totalRecords: 1, changedRecords: 1, affectedEdges: 0 },
			'incremental',
			{ budgets: [] },
		);
		expect(measurement.result).toBe('error');
		expect(measurement.reason).toBe('unknown-budget');
	});
});

// ===================================================================================================
// PERF-004 — search query cost + responsiveness WITH freshness (stale/partial without hidden data).
// ===================================================================================================

/** Build a SearchDomainIndex at given indexed vs source cursors and availability. */
function domainIndex(
	indexed: SearchIndexCursor,
	source: SearchIndexCursor,
	available = true,
): SearchDomainIndex {
	return { domain: 'note', indexedCursor: indexed, sourceCursor: source, available };
}

const cursor = (sequence: number, revision: number): SearchIndexCursor => ({
	sequence,
	revision,
	updatedAt: null,
});

describe('PERF-004 estimateSearchQueryCost / measureSearchQuery — cached query graded against the search budget', () => {
	it('a 10,000-record cached query PASSES the 250ms p95 search budget', () => {
		const { measurement } = measureSearchQuery({ indexedRecords: 10_000, returnedResults: 50, facetCount: 3 });
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(SEARCH_BUDGET_ID);
	});

	it('a pathologically large index BREACHES the search budget (adversarial)', () => {
		const { measurement, estimate } = measureSearchQuery({
			indexedRecords: 5_000_000,
			returnedResults: 100,
			facetCount: 0,
		});
		expect(estimate.estimatedMs).toBeGreaterThan(250);
		expect(measurement.result).toBe('breach');
	});

	it('the cost grows with the indexed-record count (the dominant scan term)', () => {
		const small = estimateSearchQueryCost({ indexedRecords: 100, returnedResults: 10, facetCount: 0 });
		const large = estimateSearchQueryCost({ indexedRecords: 100_000, returnedResults: 10, facetCount: 0 });
		expect(large.estimatedMs).toBeGreaterThan(small.estimatedMs);
	});

	it('an empty index still pays the base planning cost (graded normally, not unknown)', () => {
		const estimate = estimateSearchQueryCost({ indexedRecords: 0, returnedResults: 0, facetCount: 0 });
		expect(estimate.estimatedMs).toBe(DEFAULT_SEARCH_QUERY_COST_MODEL.baseMs);
	});

	it('is deterministic — identical complexity yields an identical estimate', () => {
		const c = { indexedRecords: 1234, returnedResults: 25, facetCount: 2 };
		expect(estimateSearchQueryCost(c)).toEqual(estimateSearchQueryCost({ ...c }));
	});
});

describe('PERF-004 AC2 reportSearchResponsiveness — stale/partial status visible without blocking cached results', () => {
	it('a FRESH index reports resultsComplete: true and a fresh status', () => {
		const report = reportSearchResponsiveness(domainIndex(cursor(5, 5), cursor(5, 5)), {
			indexedRecords: 1_000,
			returnedResults: 20,
			facetCount: 1,
		});
		expect(report.freshness.status).toBe('fresh');
		expect(report.resultsComplete).toBe(true);
		// The cached-query latency is still measured (results are not blocked).
		expect(report.measurement.result).toBe('pass');
	});

	it('when background indexing is INCOMPLETE (source ahead of index) the status is partial and results still return', () => {
		// Index consumed sequence 3; source advanced to 7 → indexing in progress → partial.
		const report = reportSearchResponsiveness(domainIndex(cursor(3, 3), cursor(7, 7)), {
			indexedRecords: 1_000,
			returnedResults: 20,
			facetCount: 1,
		});
		expect(report.freshness.status).toBe('partial');
		expect(report.resultsComplete).toBe(false);
		expect(report.freshness.behindBy).toBe(4);
		// CRITICAL: the cached results are STILL measured/returned — the stale status never blocks them.
		expect(report.measurement.result).toBe('pass');
	});

	it('an UNAVAILABLE source forces stale (fail closed) but still returns cached results', () => {
		const report = reportSearchResponsiveness(domainIndex(cursor(5, 5), cursor(5, 5), false), {
			indexedRecords: 1_000,
			returnedResults: 20,
			facetCount: 1,
		});
		expect(report.freshness.status).toBe('stale');
		expect(report.resultsComplete).toBe(false);
		expect(report.measurement.result).toBe('pass');
	});

	it('is deterministic — identical index + complexity yields an identical report', () => {
		const idx = domainIndex(cursor(3, 3), cursor(7, 7));
		const c = { indexedRecords: 500, returnedResults: 10, facetCount: 0 };
		expect(reportSearchResponsiveness(idx, c)).toEqual(reportSearchResponsiveness({ ...idx }, { ...c }));
	});
});

describe('PERF-004 AC2 reportGraphNavigation — graph freshness + repair signal compose the GRAPH-005 model', () => {
	const records: GraphNodeRecord[] = [
		{ id: 'a', kind: 'note', title: 'A', aliases: [], outboundTargets: ['B'], revision: 1 },
		{ id: 'b', kind: 'note', title: 'B', aliases: [], outboundTargets: [], revision: 1 },
	];

	it('a healthy graph is navigable with no reindex required', () => {
		const report = reportGraphNavigation(buildGraphIndex(records));
		expect(report.navigable).toBe(true);
		expect(report.repair.reindexRequired).toBe(false);
		expect(report.freshness.status).toBe('fresh');
	});

	it('a STALE graph (incremental update failed) is not navigable and requires a reindex', () => {
		const report = reportGraphNavigation(markGraphStale(buildGraphIndex(records)));
		expect(report.navigable).toBe(false);
		expect(report.repair.reindexRequired).toBe(true);
		expect(report.repair.reason).toBe('incremental-update-failed');
	});

	it('an UNAVAILABLE graph source requires a reindex with the source-unavailable reason', () => {
		const report = reportGraphNavigation(setGraphAvailability(buildGraphIndex(records), false));
		expect(report.navigable).toBe(false);
		expect(report.repair.reindexRequired).toBe(true);
		expect(report.repair.reason).toBe('source-unavailable');
	});
});

// ===================================================================================================
// PERF-008 — sync reconciliation cost + foreground responsiveness + resumable batches.
// ===================================================================================================

describe('PERF-008 estimateReconciliationCost / measureReconciliation — replay graded against sync-reconciliation', () => {
	it('a 1,000-op clean batch PASSES the 2s reconciliation budget', () => {
		const { measurement, estimate } = measureReconciliation({
			queuedOperations: 1_000,
			deferredOperations: 0,
			conflictingOperations: 0,
		});
		expect(estimate.replayedOperationCount).toBe(1_000);
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(SYNC_RECONCILIATION_BUDGET_ID);
	});

	it('a pathologically large backlog BREACHES the reconciliation budget (adversarial)', () => {
		const { measurement, estimate } = measureReconciliation({
			queuedOperations: 100_000,
			deferredOperations: 0,
			conflictingOperations: 0,
		});
		expect(estimate.estimatedMs).toBeGreaterThan(2_000);
		expect(measurement.result).toBe('breach');
		expect(measurement.message).toContain('Sync'); // owning domain named on a breach
	});

	it('deferred and conflicting operations add EXTRA cost over a clean batch of the same size', () => {
		const clean = estimateReconciliationCost({ queuedOperations: 100, deferredOperations: 0, conflictingOperations: 0 });
		const messy = estimateReconciliationCost({ queuedOperations: 100, deferredOperations: 20, conflictingOperations: 10 });
		expect(messy.estimatedMs).toBeGreaterThan(clean.estimatedMs);
		expect(messy.estimatedMs).toBe(
			clean.estimatedMs +
				DEFAULT_RECONCILIATION_COST_MODEL.perDeferredOperationMs * 20 +
				DEFAULT_RECONCILIATION_COST_MODEL.perConflictMs * 10,
		);
	});

	it('clamps deferred/conflicting counts to the queued count (cannot defer/conflict more than queued)', () => {
		const est = estimateReconciliationCost({ queuedOperations: 5, deferredOperations: 99, conflictingOperations: 99 });
		// 5 ops + 5 deferred-extra + 5 conflict-extra, never more than the 5 queued.
		expect(est.estimatedMs).toBe(
			DEFAULT_RECONCILIATION_COST_MODEL.baseMs +
				DEFAULT_RECONCILIATION_COST_MODEL.perOperationMs * 5 +
				DEFAULT_RECONCILIATION_COST_MODEL.perDeferredOperationMs * 5 +
				DEFAULT_RECONCILIATION_COST_MODEL.perConflictMs * 5,
		);
	});

	it('an empty batch is graded normally (it still pays the base setup, not unknown)', () => {
		const { measurement, estimate } = measureReconciliation({
			queuedOperations: 0,
			deferredOperations: 0,
			conflictingOperations: 0,
		});
		expect(estimate.estimatedMs).toBe(DEFAULT_RECONCILIATION_COST_MODEL.baseMs);
		expect(measurement.result).toBe('pass');
	});

	it('is deterministic — identical complexity yields an identical estimate', () => {
		const c = { queuedOperations: 750, deferredOperations: 30, conflictingOperations: 12 };
		expect(estimateReconciliationCost(c)).toEqual(estimateReconciliationCost({ ...c }));
	});
});

describe('PERF-008 AC1 measureForegroundDuringBackgroundWork — concurrent command stays within ITS OWN budget', () => {
	it('maps each foreground command kind to its own responsiveness budget', () => {
		expect(foregroundBudgetIdFor('search')).toBe(SEARCH_BUDGET_ID);
		expect(foregroundBudgetIdFor('navigate')).toBe(GRAPH_INDEXING_BUDGET_ID);
		expect(foregroundBudgetIdFor('advance-combat')).toBe('widget-update');
	});

	it('a search captured DURING a reindex that stays under 250ms p95 PASSES (background work stayed off the critical path)', () => {
		// Foreground search latencies captured while a large reindex ran in the background.
		const measurement = measureForegroundDuringBackgroundWork('search', [40, 55, 60, 80, 120]);
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(SEARCH_BUDGET_ID);
	});

	it('a combat advance pushed OVER its 100ms widget-update budget by background work is a BREACH naming the budget', () => {
		// p95 of these samples exceeds the 100ms widget-update ceiling → the background work starved the foreground.
		const measurement = measureForegroundDuringBackgroundWork('advance-combat', [90, 95, 110, 130, 400]);
		expect(measurement.result).toBe('breach');
		expect(measurement.budget?.id).toBe('widget-update');
	});

	it('an EMPTY foreground sample set is unknown (un-proven), never a confident pass', () => {
		const measurement = measureForegroundDuringBackgroundWork('navigate', []);
		expect(measurement.result).toBe('unknown');
		expect(measurement.reason).toBe('no-samples');
	});

	it('exactly AT the foreground budget threshold PASSES (inclusive)', () => {
		// A single 100ms sample == the widget-update p95 ceiling.
		const measurement = measureForegroundDuringBackgroundWork('advance-combat', [100]);
		expect(measurement.result).toBe('pass');
		expect(measurement.marginToTarget).toBe(0);
	});

	it('is deterministic — identical samples yield an identical verdict', () => {
		const samples = [40, 55, 60, 80, 120];
		expect(measureForegroundDuringBackgroundWork('search', samples)).toEqual(
			measureForegroundDuringBackgroundWork('search', [...samples]),
		);
	});
});

describe('PERF-008 AC2 planBatchResumption — resume from checkpoint, or restart with a visible diagnostic', () => {
	const checkpoint = (
		batchId: string,
		processedItems: number,
		totalItems: number,
	): BackgroundWorkCheckpoint => ({ batchId, processedItems, totalItems });

	it('a valid mid-progress checkpoint RESUMES from the processed count with only the remaining items', () => {
		const plan = planBatchResumption('reindex-1', 1_000, checkpoint('reindex-1', 600, 1_000));
		expect(plan.action).toBe('resume');
		expect(plan.resumeFromIndex).toBe(600);
		expect(plan.remainingItems).toBe(400);
		expect(plan.restartReason).toBeNull();
	});

	it('NO checkpoint RESTARTS from the beginning with a visible no-checkpoint diagnostic (fail closed)', () => {
		const plan = planBatchResumption('reindex-1', 1_000, null);
		expect(plan.action).toBe('restart');
		expect(plan.restartReason).toBe('no-checkpoint');
		expect(plan.remainingItems).toBe(1_000);
		expect(plan.message).toContain('restarting');
	});

	it('a checkpoint for a DIFFERENT batch RESTARTS with a batch-mismatch diagnostic (a stale checkpoint cannot be trusted)', () => {
		const plan = planBatchResumption('reindex-2', 500, checkpoint('reindex-1', 300, 500));
		expect(plan.action).toBe('restart');
		expect(plan.restartReason).toBe('checkpoint-batch-mismatch');
	});

	it('a CORRUPT checkpoint (processed > total) RESTARTS with a corrupt diagnostic', () => {
		const plan = planBatchResumption('reindex-1', 1_000, checkpoint('reindex-1', 1_500, 1_000));
		expect(plan.action).toBe('restart');
		expect(plan.restartReason).toBe('checkpoint-corrupt');
	});

	it('a checkpoint whose total DISAGREES with the batch total RESTARTS (the checkpoint cannot be trusted)', () => {
		const plan = planBatchResumption('reindex-1', 1_000, checkpoint('reindex-1', 600, 900));
		expect(plan.action).toBe('restart');
		expect(plan.restartReason).toBe('checkpoint-corrupt');
	});

	it('a checkpoint at processed == total is ALREADY-COMPLETE (nothing to resume, no double work)', () => {
		const plan = planBatchResumption('reindex-1', 1_000, checkpoint('reindex-1', 1_000, 1_000));
		expect(plan.action).toBe('already-complete');
		expect(plan.remainingItems).toBe(0);
	});

	it('an empty batch (total 0) with a matching complete checkpoint is already-complete', () => {
		const plan = planBatchResumption('reindex-1', 0, checkpoint('reindex-1', 0, 0));
		expect(plan.action).toBe('already-complete');
		expect(plan.remainingItems).toBe(0);
	});

	it('is deterministic — identical inputs yield an identical plan', () => {
		const cp = checkpoint('reindex-1', 600, 1_000);
		expect(planBatchResumption('reindex-1', 1_000, cp)).toEqual(
			planBatchResumption('reindex-1', 1_000, { ...cp }),
		);
	});
});

// ===================================================================================================
// Composition — proves these grade against the canonical registry, never a parallel grader/budget.
// ===================================================================================================

describe('PERF-004 / PERF-008 composition — the canonical PERF registry owns every budget, fail closed', () => {
	it('the search / graph-indexing / sync-reconciliation ids are owned by the canonical registry', () => {
		expect(budgetForId(SEARCH_BUDGET_ID, PERFORMANCE_BUDGETS)?.owner).toBe('Search');
		expect(budgetForId(GRAPH_INDEXING_BUDGET_ID, PERFORMANCE_BUDGETS)?.owner).toBe('Graph');
		expect(budgetForId(SYNC_RECONCILIATION_BUDGET_ID, PERFORMANCE_BUDGETS)?.owner).toBe('Sync');
	});

	it('every foreground budget id resolves to a registry-owned budget (no dangling id)', () => {
		for (const kind of ['search', 'navigate', 'advance-combat'] as const) {
			expect(budgetForId(foregroundBudgetIdFor(kind), PERFORMANCE_BUDGETS)).not.toBeNull();
		}
	});

	it('measuring against an unknown budget is an error everywhere (search/index/reconciliation), never a pass', () => {
		const search = measureSearchQuery({ indexedRecords: 1, returnedResults: 1, facetCount: 0 }, { budgets: [] });
		const recon = measureReconciliation(
			{ queuedOperations: 1, deferredOperations: 0, conflictingOperations: 0 },
			{ budgets: [] },
		);
		expect(search.measurement.result).toBe('error');
		expect(recon.measurement.result).toBe('error');
	});
});
