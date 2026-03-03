import { getStorage } from '$lib/platform/storage/index.js';

class PlayerModeState {
	enabled = $state(false);
	loading = $state(false);

	async loadFromStorage(): Promise<void> {
		this.loading = true;
		try {
			this.enabled = await getStorage().getSetting('playerModeEnabled');
		} finally {
			this.loading = false;
		}
	}

	async setEnabled(enabled: boolean): Promise<void> {
		if (this.enabled === enabled) return;
		this.enabled = enabled;
		await getStorage().setSetting('playerModeEnabled', enabled);
	}

	async toggle(): Promise<void> {
		await this.setEnabled(!this.enabled);
	}
}

export const playerModeState = new PlayerModeState();
