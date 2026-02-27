import { getStorage } from '$lib/platform/storage/index.js';
import { DEFAULT_SETTINGS, type EditorSettings } from '$lib/types/settings.js';

class EditorPreferencesState {
	settings = $state<EditorSettings>({ ...DEFAULT_SETTINGS.editor });
	loaded = $state(false);

	async load(): Promise<void> {
		const storage = getStorage();
		const persisted = await storage.getSetting('editor');
		this.settings = { ...DEFAULT_SETTINGS.editor, ...persisted };
		this.loaded = true;
	}

	async update(updates: Partial<EditorSettings>): Promise<void> {
		this.settings = { ...this.settings, ...updates };
		await getStorage().setSetting('editor', this.settings);
	}
}

export const editorPreferencesState = new EditorPreferencesState();
