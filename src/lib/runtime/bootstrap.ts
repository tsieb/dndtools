import { initStorage } from '$lib/platform/storage/index.js';
import { ui } from '$lib/state/ui.svelte.js';
import { onboardingState } from '$lib/state/onboarding.svelte.js';
import { notesState } from '$lib/state/notes.svelte.js';
import { searchService } from '$lib/domain/search.js';
import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
import { searchState } from '$lib/state/search.svelte.js';
import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
import { playerModeState } from '$lib/state/player-mode.svelte.js';
import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
import { markSubsystemSuccess, reportRuntimeError } from '$lib/runtime/diagnostics.js';
import { toastState } from '$lib/state/toast.svelte.js';
import {
	getDesktopIntegrityReport,
	getDesktopSchemaMigrationReport,
	type DesktopSchemaMigrationReport,
} from '$lib/platform/desktop/bridge.js';

/**
 * Thrown when the vault's schema requires user-approved migration before the
 * app can proceed. The caller (RuntimeState) intercepts this and gates the UI
 * on the migration readiness screen instead of showing a hard error.
 */
export class MigrationRequiredError extends Error {
	constructor(public readonly report: DesktopSchemaMigrationReport) {
		super('MIGRATION_REQUIRED');
		this.name = 'MigrationRequiredError';
	}
}

let bootstrapPromise: Promise<void> | null = null;

export async function bootstrapApplication(): Promise<void> {
	if (bootstrapPromise) {
		return bootstrapPromise;
	}

	bootstrapPromise = (async () => {
		try {
			const preflight = await getDesktopSchemaMigrationReport();
			if (preflight.vaultTooNew) {
				throw new Error(
					'This vault was created with a newer version of DND Tools and cannot be opened. Please upgrade the application.',
				);
			}
			if (preflight.upgradeRequired) {
				// Surface to the caller rather than auto-applying so the user can
				// review the dry-run report and approve the upgrade explicitly.
				throw new MigrationRequiredError(preflight);
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
			playerModeState.loadFromStorage(),
			featureSettingsState.loadFromStorage(),
		]);

		await notesState.loadAll();

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
