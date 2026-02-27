import { initStorage } from '$lib/platform/storage/index.js';
import { ui } from '$lib/state/ui.svelte.js';
import { onboardingState } from '$lib/state/onboarding.svelte.js';
import { notesState } from '$lib/state/notes.svelte.js';
import { searchService } from '$lib/domain/search.js';
import { createWelcomeNote } from '$lib/domain/welcome-note.js';
import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
import { searchState } from '$lib/state/search.svelte.js';
import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
import { markSubsystemSuccess, reportRuntimeError } from '$lib/runtime/diagnostics.js';
import { toastState } from '$lib/state/toast.svelte.js';
import {
	getDesktopIntegrityReport,
	getDesktopSchemaMigrationReport,
	runDesktopSchemaMigrations,
} from '$lib/platform/desktop/bridge.js';

let bootstrapPromise: Promise<void> | null = null;

export async function bootstrapApplication(): Promise<void> {
	if (bootstrapPromise) {
		return bootstrapPromise;
	}

	bootstrapPromise = (async () => {
		try {
			const preflight = await getDesktopSchemaMigrationReport();
			if (preflight.upgradeRequired) {
				const migration = await runDesktopSchemaMigrations({
					dryRun: false,
					createCheckpoint: true,
				});
				if (migration.failures.length > 0) {
					throw new Error(
						`Vault upgrade required, but migration failed: ${migration.failures[0]?.message ?? 'unknown error'}`,
					);
				}
			}
		} catch (error) {
			if (window.dndtoolsDesktop) {
				throw error;
			}
		}

		await initStorage();
		await Promise.all([
			ui.loadFromStorage(),
			editorPreferencesState.load(),
			onboardingState.loadFromStorage(),
		]);
		ui.checkMobile();

		await notesState.loadAll();
		if (notesState.notes.length === 0) {
			await createWelcomeNote();
			await notesState.loadAll();
		}

		await Promise.all([
			searchService.buildIndex(notesState.notes),
			searchState.loadSavedSearches(),
			mcpChangesState.refresh(),
			sessionBoardsState.loadAll(),
		]);

		try {
			const integrity = await getDesktopIntegrityReport();
			if (!integrity.healthy) {
				const issueCount = integrity.issues.length + integrity.noteIssues.length;
				toastState.error(
					`Vault integrity needs attention: ${issueCount} issue${issueCount === 1 ? '' : 's'}. Open Settings > Vault to repair.`,
				);
			}
		} catch {
			// Ignore when desktop bridge is unavailable.
		}
		await Promise.all([
			markSubsystemSuccess('runtime_bootstrap'),
			markSubsystemSuccess('search_index'),
			markSubsystemSuccess('link_graph_build'),
		]);
	})().catch((error) => {
		void reportRuntimeError({
			category: 'ui_runtime',
			error,
			code: 'BOOTSTRAP_FAILED',
		});
		bootstrapPromise = null;
		throw error;
	});

	return bootstrapPromise;
}
