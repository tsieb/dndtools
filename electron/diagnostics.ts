import os from 'node:os';
import { nowISO } from '../src/lib/utils/date.js';
import type {
	HealthSubsystem,
	StructuredErrorEvent,
	SubsystemSuccessTimestamps,
} from '../src/lib/types/diagnostics.js';

export interface DiagnosticsHealthSnapshot {
	generatedAt: string;
	lastSuccessful: SubsystemSuccessTimestamps;
	recentErrors: StructuredErrorEvent[];
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

export class DiagnosticsTracker {
	private recentErrors: StructuredErrorEvent[] = [];
	private lastSuccessful: SubsystemSuccessTimestamps = { ...EMPTY_TIMESTAMPS };

	markSubsystemSuccess(subsystem: HealthSubsystem): void {
		this.lastSuccessful[subsystem] = nowISO();
	}

	recordError(event: StructuredErrorEvent): void {
		this.recentErrors.push(event);
		if (this.recentErrors.length > 250) {
			this.recentErrors.shift();
		}
	}

	getHealthSnapshot(limit = 40): DiagnosticsHealthSnapshot {
		return {
			generatedAt: nowISO(),
			lastSuccessful: { ...this.lastSuccessful },
			recentErrors: this.recentErrors.slice(-limit).reverse(),
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
