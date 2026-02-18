import { initStorage } from '$lib/storage/index.js';
import { ui } from '$lib/stores/ui.svelte.js';
import { notesState } from '$lib/stores/notes.svelte.js';
import { searchService } from '$lib/services/search.js';
import { linksState } from '$lib/stores/links.svelte.js';
import { createWelcomeNote } from '$lib/services/welcome-note.js';
import { mcpChangesState } from '$lib/stores/mcp-changes.svelte.js';
import { sessionBoardsState } from '$lib/stores/session-boards.svelte.js';

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
