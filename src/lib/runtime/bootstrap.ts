import { initStorage } from '$lib/platform/storage/index.js';
import { ui } from '$lib/state/ui.svelte.js';
import { notesState } from '$lib/state/notes.svelte.js';
import { searchService } from '$lib/domain/search.js';
import { linksState } from '$lib/state/links.svelte.js';
import { createWelcomeNote } from '$lib/domain/welcome-note.js';
import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';

let bootstrapPromise: Promise<void> | null = null;

export async function bootstrapApplication(): Promise<void> {
	if (bootstrapPromise) {
		return bootstrapPromise;
	}

	bootstrapPromise = (async () => {
		await initStorage();
		await ui.loadFromStorage();
		ui.checkMobile();

		await notesState.loadAll();
		if (notesState.notes.length === 0) {
			await createWelcomeNote();
			await notesState.loadAll();
		}

		await Promise.all([
			searchService.buildIndex(notesState.notes),
			linksState.buildGraph(),
			mcpChangesState.refresh(),
			sessionBoardsState.loadAll(),
		]);
	})().catch((error) => {
		bootstrapPromise = null;
		throw error;
	});

	return bootstrapPromise;
}
