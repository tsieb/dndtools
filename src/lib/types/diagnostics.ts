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
