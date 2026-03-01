import { bootstrapApplication, MigrationRequiredError } from '$lib/runtime/bootstrap.js';
import { recordPerformanceMeasurement, reportRuntimeError } from '$lib/runtime/diagnostics.js';
import {
	runDesktopSchemaMigrations,
	type DesktopSchemaMigrationReport,
} from '$lib/platform/desktop/bridge.js';

class RuntimeState {
	ready = $state(false);
	initializing = $state(false);
	error = $state<string | null>(null);
	/** Non-null when a schema upgrade is required and awaiting user approval. */
	migrationReport = $state<DesktopSchemaMigrationReport | null>(null);
	applyingMigration = $state(false);
	migrationError = $state<string | null>(null);

	async initialize(): Promise<void> {
		if (this.ready || this.initializing) {
			return;
		}

		const measureId = `cold-start-${Date.now()}`;
		const startMark = `dndtools:${measureId}:start`;
		const endMark = `dndtools:${measureId}:end`;
		const measureName = `dndtools:${measureId}:measure`;
		const startedAt = performance.now();
		performance.mark(startMark);

		this.initializing = true;
		this.error = null;
		this.migrationReport = null;
		try {
			await bootstrapApplication();
			this.ready = true;
		} catch (error) {
			if (error instanceof MigrationRequiredError) {
				// Pause bootstrap at the migration gate; the UI will render the
				// migration readiness screen and call applyMigration() on approval.
				this.migrationReport = error.report;
			} else {
				this.error = error instanceof Error ? error.message : String(error);
				void reportRuntimeError({
					category: 'ui_runtime',
					error,
					code: 'RUNTIME_INITIALIZE_FAILED',
				});
			}
		} finally {
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
			const durationMs = Number(
				((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
			);
			performance.clearMarks(startMark);
			performance.clearMarks(endMark);
			performance.clearMeasures(measureName);
			void recordPerformanceMeasurement({
				operation: 'cold_start',
				durationMs,
				context: {
					ready: this.ready,
					migrationRequired: !!this.migrationReport,
					hadError: this.error !== null,
				},
			});
			this.initializing = false;
		}
	}

	/**
	 * Apply pending schema migrations after user approval from the migration
	 * readiness screen. On success, re-runs the remainder of the bootstrap
	 * sequence to bring the app to the ready state.
	 */
	async applyMigration(): Promise<void> {
		if (!this.migrationReport) return;
		this.applyingMigration = true;
		this.migrationError = null;
		try {
			const result = await runDesktopSchemaMigrations({ dryRun: false, createCheckpoint: true });
			if (result.failures.length > 0) {
				this.migrationError =
					result.failures[0]?.message ?? 'Migration failed for an unknown reason.';
				return;
			}
			// Migration succeeded — clear the gate and restart bootstrap from scratch.
			this.migrationReport = null;
			this.initializing = false;
			this.ready = false;
			await this.initialize();
		} catch (error) {
			this.migrationError = error instanceof Error ? error.message : String(error);
			void reportRuntimeError({
				category: 'ui_runtime',
				error,
				code: 'MIGRATION_APPLY_FAILED',
			});
		} finally {
			this.applyingMigration = false;
		}
	}
}

export const runtimeState = new RuntimeState();
