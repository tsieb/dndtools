import os from 'node:os';
import { nowISO } from '../src/lib/utils/date.js';
import type {
	HealthSubsystem,
	PerformanceMeasurement,
	PerformanceMeasurementInput,
	PerformanceOperation,
	PerformanceOperationSummary,
	PerformanceTelemetrySnapshot,
	PerformanceBudgetDefinition,
	StructuredErrorEvent,
	SubsystemSuccessTimestamps,
} from '../src/lib/types/diagnostics.js';
import { PERFORMANCE_BUDGETS } from '../src/lib/types/diagnostics.js';

export interface DiagnosticsHealthSnapshot {
	generatedAt: string;
	lastSuccessful: SubsystemSuccessTimestamps;
	recentErrors: StructuredErrorEvent[];
	performance: PerformanceTelemetrySnapshot;
}

export interface DiagnosticsBundleEnvironment {
	platform: NodeJS.Platform;
	arch: string;
	nodeVersion: string;
	electronVersion: string;
	cpuCount: number;
	totalMemoryMb: number;
}

export interface DiagnosticsBundleMetrics {
	noteCount: number | null;
	tagCount: number | null;
	pendingMcpChangeCount: number | null;
	processUptimeSeconds: number;
	memoryRssMb: number;
}

export interface DiagnosticsBundle {
	generatedAt: string;
	health: DiagnosticsHealthSnapshot;
	environment: DiagnosticsBundleEnvironment;
	metrics: DiagnosticsBundleMetrics;
	mcp: {
		status: unknown;
		lifecycle: unknown[];
	};
	logs: StructuredErrorEvent[];
}

const EMPTY_TIMESTAMPS: SubsystemSuccessTimestamps = {
	runtime_bootstrap: null,
	vault_sync: null,
	search_index: null,
	link_graph_build: null,
};

const MAX_PERFORMANCE_SAMPLES = 600;
const DEFAULT_PERFORMANCE_TIMELINE_LIMIT = 120;

function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
	return Number((sorted[index] ?? 0).toFixed(2));
}

function average(values: number[]): number | null {
	if (values.length === 0) return null;
	const sum = values.reduce((acc, value) => acc + value, 0);
	return Number((sum / values.length).toFixed(2));
}

function toSummary(
	budget: PerformanceBudgetDefinition,
	samples: PerformanceMeasurement[],
): PerformanceOperationSummary {
	const durations = samples.map((sample) => sample.durationMs);
	const maxMs = durations.length > 0 ? Math.max(...durations) : null;
	const latest = samples[samples.length - 1] ?? null;

	return {
		operation: budget.operation,
		label: budget.label,
		description: budget.description,
		targetMs: budget.targetMs,
		regressionThresholdMs: budget.regressionThresholdMs,
		sampleCount: samples.length,
		p50Ms: percentile(durations, 0.5),
		p95Ms: percentile(durations, 0.95),
		p99Ms: percentile(durations, 0.99),
		averageMs: average(durations),
		maxMs: maxMs === null ? null : Number(maxMs.toFixed(2)),
		lastMs: latest ? Number(latest.durationMs.toFixed(2)) : null,
		lastAt: latest?.at ?? null,
		exceededBudgetCount: samples.filter((sample) => sample.exceededBudget).length,
	};
}

export class DiagnosticsTracker {
	private recentErrors: StructuredErrorEvent[] = [];
	private lastSuccessful: SubsystemSuccessTimestamps = { ...EMPTY_TIMESTAMPS };
	private performanceSamples: PerformanceMeasurement[] = [];
	private seenPerformanceKeys = new Set<string>();

	markSubsystemSuccess(subsystem: HealthSubsystem): void {
		this.lastSuccessful[subsystem] = nowISO();
	}

	recordError(event: StructuredErrorEvent): void {
		this.recentErrors.push(event);
		if (this.recentErrors.length > 250) {
			this.recentErrors.shift();
		}
	}

	recordPerformance(input: PerformanceMeasurementInput): void {
		const budget = PERFORMANCE_BUDGETS[input.operation];
		const durationMs = Number.isFinite(input.durationMs) ? Math.max(0, input.durationMs) : 0;
		const sample: PerformanceMeasurement = {
			operation: input.operation,
			durationMs: Number(durationMs.toFixed(2)),
			at: input.at ?? nowISO(),
			source: input.source,
			context: input.context ?? {},
			budgetMs: budget.targetMs,
			regressionThresholdMs: budget.regressionThresholdMs,
			exceededBudget: durationMs > budget.targetMs,
		};
		const dedupeKey = `${sample.source}|${sample.operation}|${sample.at}|${sample.durationMs}|${JSON.stringify(sample.context ?? {})}`;
		if (this.seenPerformanceKeys.has(dedupeKey)) {
			return;
		}
		this.seenPerformanceKeys.add(dedupeKey);
		if (this.seenPerformanceKeys.size > 5_000) {
			// Keep memory bounded in long-running sessions.
			this.seenPerformanceKeys.clear();
		}
		this.performanceSamples.push(sample);
		if (this.performanceSamples.length > MAX_PERFORMANCE_SAMPLES) {
			this.performanceSamples.shift();
		}
	}

	private getPerformanceSnapshot(
		timelineLimit = DEFAULT_PERFORMANCE_TIMELINE_LIMIT,
	): PerformanceTelemetrySnapshot {
		const byOperation = new Map<PerformanceOperation, PerformanceMeasurement[]>();
		for (const operation of Object.keys(PERFORMANCE_BUDGETS) as PerformanceOperation[]) {
			byOperation.set(operation, []);
		}

		for (const sample of this.performanceSamples) {
			byOperation.get(sample.operation)?.push(sample);
		}

		const summaries = (Object.keys(PERFORMANCE_BUDGETS) as PerformanceOperation[]).map(
			(operation) => toSummary(PERFORMANCE_BUDGETS[operation], byOperation.get(operation) ?? []),
		);

		return {
			generatedAt: nowISO(),
			summaries,
			timeline: this.performanceSamples.slice(-timelineLimit).reverse(),
		};
	}

	getHealthSnapshot(limit = 40): DiagnosticsHealthSnapshot {
		return {
			generatedAt: nowISO(),
			lastSuccessful: { ...this.lastSuccessful },
			recentErrors: this.recentErrors.slice(-limit).reverse(),
			performance: this.getPerformanceSnapshot(),
		};
	}

	getEnvironment(): DiagnosticsBundleEnvironment {
		return {
			platform: process.platform,
			arch: process.arch,
			nodeVersion: process.version,
			electronVersion: process.versions.electron ?? 'unknown',
			cpuCount: os.cpus().length,
			totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
		};
	}

	getMetrics(input: {
		noteCount: number | null;
		tagCount: number | null;
		pendingMcpChangeCount: number | null;
	}): DiagnosticsBundleMetrics {
		return {
			noteCount: input.noteCount,
			tagCount: input.tagCount,
			pendingMcpChangeCount: input.pendingMcpChangeCount,
			processUptimeSeconds: Math.round(process.uptime()),
			memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
		};
	}
}
