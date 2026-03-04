import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwaState } from './pwa.svelte.js';

function resetPwaState(): void {
	pwaState.dispose();
	pwaState.promptEvent = null;
	pwaState.noteOpenCount = 0;
	pwaState.installPromptDismissed = false;
	pwaState.installed = false;
	pwaState.serviceWorkerReady = false;
	pwaState.online = true;
	window.localStorage.clear();
	delete window.dndtoolsDesktop;
}

describe('pwaState', () => {
	afterEach(() => {
		resetPwaState();
		vi.restoreAllMocks();
	});

	it('shows install prompt only after opening three notes', () => {
		resetPwaState();
		pwaState.initialize();
		pwaState.promptEvent = {
			prompt: async () => undefined,
			userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
		} as unknown as BeforeInstallPromptEvent;

		pwaState.recordNoteOpened('note-1');
		pwaState.recordNoteOpened('note-2');
		expect(pwaState.shouldShowInstallPrompt).toBe(false);

		pwaState.recordNoteOpened('note-3');
		expect(pwaState.shouldShowInstallPrompt).toBe(true);
	});

	it('marks install as complete when the browser accepts prompt', async () => {
		resetPwaState();
		pwaState.initialize();
		const prompt = vi.fn(async () => undefined);
		pwaState.promptEvent = {
			prompt,
			userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
		} as unknown as BeforeInstallPromptEvent;

		await pwaState.promptInstall();

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(pwaState.installed).toBe(true);
		expect(pwaState.installPromptDismissed).toBe(true);
		expect(pwaState.promptEvent).toBeNull();
	});
});
