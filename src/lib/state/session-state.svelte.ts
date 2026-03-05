import { getStorage } from '$lib/platform/storage/index.js';
import {
	DEFAULT_SESSION_STATE,
	normalizeSessionState,
	type SessionPartyLocation,
	type SessionState,
} from '$lib/types/session-state.js';

class SessionStateStore {
	state = $state<SessionState>({ ...DEFAULT_SESSION_STATE });
	loading = $state(false);
	error = $state<string | null>(null);

	partyLocation = $derived(this.state.partyLocation);

	async load(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const storage = getStorage();
			if (!storage.getSessionState) {
				this.state = { ...DEFAULT_SESSION_STATE };
				return;
			}
			this.state = normalizeSessionState(await storage.getSessionState());
		} catch (error) {
			this.error = String(error);
			this.state = { ...DEFAULT_SESSION_STATE };
		} finally {
			this.loading = false;
		}
	}

	async save(nextState: SessionState): Promise<void> {
		const normalized = normalizeSessionState(nextState);
		this.state = normalized;
		const storage = getStorage();
		if (!storage.saveSessionState) return;
		await storage.saveSessionState(normalized);
	}

	async setPartyLocation(location: SessionPartyLocation | null): Promise<void> {
		await this.save({
			version: 1,
			partyLocation: location
				? {
						...location,
						mapId: location.mapId.trim(),
						updatedAt: location.updatedAt,
					}
				: null,
		});
	}
}

export const sessionState = new SessionStateStore();
