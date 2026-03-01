export type ErrorCategory = 'storage' | 'parsing' | 'ipc' | 'mcp_sidecar' | 'ui_runtime';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export type HealthSubsystem =
	| 'runtime_bootstrap'
	| 'vault_sync'
	| 'search_index'
	| 'link_graph_build';

export interface StructuredErrorEvent {
	id: string;
	at: string;
	category: ErrorCategory;
	code: string;
	message: string;
	severity: ErrorSeverity;
	/** Human-readable guidance on how to resolve the error. */
	recoveryHint: string | null;
	details: string | null;
	context: Record<string, string | number | boolean | null>;
}

export interface SubsystemSuccessTimestamps {
	runtime_bootstrap: string | null;
	vault_sync: string | null;
	search_index: string | null;
	link_graph_build: string | null;
}

export interface McpLifecycleEvent {
	at: string;
	event: 'start' | 'stop' | 'restart' | 'crash';
	reason: string | null;
	pid: number | null;
}

export type PerformanceOperation =
	| 'cold_start'
	| 'vault_open'
	| 'note_open'
	| 'search_response'
	| 'note_save'
	| 'graph_rebuild_incremental'
	| 'mcp_bundle_call';

export interface PerformanceBudgetDefinition {
	operation: PerformanceOperation;
	label: string;
	description: string;
	targetMs: number;
	regressionThresholdMs: number;
}

export const PERFORMANCE_BUDGETS: Record<PerformanceOperation, PerformanceBudgetDefinition> = {
	cold_start: {
		operation: 'cold_start',
		label: 'Cold Start',
		description: 'Desktop launch to ready shell.',
		targetMs: 3_000,
		regressionThresholdMs: 3_600,
	},
	vault_open: {
		operation: 'vault_open',
		label: 'Vault Open (5k)',
		description: 'Select/open vault and finish initial load.',
		targetMs: 2_000,
		regressionThresholdMs: 2_400,
	},
	note_open: {
		operation: 'note_open',
		label: 'Note Open',
		description: 'Notes list click to note view ready.',
		targetMs: 200,
		regressionThresholdMs: 240,
	},
	search_response: {
		operation: 'search_response',
		label: 'Search Response',
		description: 'Search query to visible result set.',
		targetMs: 150,
		regressionThresholdMs: 180,
	},
	note_save: {
		operation: 'note_save',
		label: 'Note Save',
		description: 'Save trigger to persisted completion.',
		targetMs: 100,
		regressionThresholdMs: 120,
	},
	graph_rebuild_incremental: {
		operation: 'graph_rebuild_incremental',
		label: 'Graph Rebuild (Incremental)',
		description: 'Single-note graph update after mutation.',
		targetMs: 50,
		regressionThresholdMs: 60,
	},
	mcp_bundle_call: {
		operation: 'mcp_bundle_call',
		label: 'MCP Bundle Call',
		description: 'Session/recap/continuity bundle tool call.',
		targetMs: 800,
		regressionThresholdMs: 960,
	},
};

export interface PerformanceMeasurementInput {
	operation: PerformanceOperation;
	durationMs: number;
	at?: string;
	source: 'renderer' | 'main' | 'mcp';
	context?: Record<string, string | number | boolean | null>;
}

export interface PerformanceMeasurement extends PerformanceMeasurementInput {
	at: string;
	budgetMs: number;
	regressionThresholdMs: number;
	exceededBudget: boolean;
}

export interface PerformanceOperationSummary {
	operation: PerformanceOperation;
	label: string;
	description: string;
	targetMs: number;
	regressionThresholdMs: number;
	sampleCount: number;
	p50Ms: number | null;
	p95Ms: number | null;
	p99Ms: number | null;
	averageMs: number | null;
	maxMs: number | null;
	lastMs: number | null;
	lastAt: string | null;
	exceededBudgetCount: number;
}

export interface PerformanceTelemetrySnapshot {
	generatedAt: string;
	summaries: PerformanceOperationSummary[];
	timeline: PerformanceMeasurement[];
}
