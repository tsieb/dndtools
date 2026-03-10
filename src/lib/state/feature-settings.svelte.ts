import { getStorage } from '$lib/platform/storage/index.js';
import {
	normalizeFeatureSettings,
	type AdvancedFeatureId,
	type FeatureSettings,
} from '$lib/types/settings.js';

class FeatureSettingsState {
	settings = $state<FeatureSettings>(normalizeFeatureSettings(null));
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	isAdvancedEnabled(featureId: AdvancedFeatureId): boolean {
		return this.settings.advanced[featureId];
	}

	isPromptDismissed(promptId: string): boolean {
		return this.settings.dismissedPrompts.includes(promptId);
	}

	async loadFromStorage(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const stored = await getStorage().getSetting('featureSettings');
			this.settings = normalizeFeatureSettings(stored);
			this.loaded = true;
		} catch (error) {
			this.error = String(error);
			this.settings = normalizeFeatureSettings(null);
			this.loaded = false;
		} finally {
			this.loading = false;
		}
	}

	private async persist(next: FeatureSettings): Promise<void> {
		this.settings = next;
		await getStorage().setSetting('featureSettings', next);
	}

	async setAdvancedEnabled(featureId: AdvancedFeatureId, enabled: boolean): Promise<void> {
		const next = normalizeFeatureSettings({
			...this.settings,
			advanced: {
				...this.settings.advanced,
				[featureId]: enabled,
			},
		});
		await this.persist(next);
	}

	async setMcpAccessAcknowledged(acknowledged: boolean): Promise<void> {
		const next = normalizeFeatureSettings({
			...this.settings,
			mcpAccessAcknowledged: acknowledged,
		});
		await this.persist(next);
	}

	async dismissPrompt(promptId: string): Promise<void> {
		const normalized = promptId.trim();
		if (!normalized || this.settings.dismissedPrompts.includes(normalized)) return;
		const next = normalizeFeatureSettings({
			...this.settings,
			dismissedPrompts: [...this.settings.dismissedPrompts, normalized],
		});
		await this.persist(next);
	}
}

export const featureSettingsState = new FeatureSettingsState();
