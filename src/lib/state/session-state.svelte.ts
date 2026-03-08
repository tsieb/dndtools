import { getStorage } from '$lib/platform/storage/index.js';
import {
	DEFAULT_SESSION_STATE,
	normalizeSessionState,
	type SessionPartyLocation,
	type SessionMode,
	type ActiveSessionState,
	type SessionCombatantState,
	type SessionRollHistoryEntry,
	type SessionState,
} from '$lib/types/session-state.js';

class SessionStateStore {
	state = $state<SessionState>({ ...DEFAULT_SESSION_STATE });
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	partyLocation = $derived(this.state.partyLocation);
	mode = $derived(this.state.mode);
	activeSession = $derived(this.state.activeSession);
	sessionRollHistory = $derived(this.state.sessionRollHistory);
	pinnedRollableTableIds = $derived(this.state.pinnedRollableTableIds);

	async load(): Promise<void> {
		if (this.loading) return;
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
			this.loaded = true;
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
			...this.state,
			partyLocation: location
				? {
						...location,
						mapId: location.mapId.trim(),
						updatedAt: location.updatedAt,
					}
				: null,
		});
	}

	async setSessionMode(
		mode: SessionMode,
		session: ActiveSessionState | null,
		options?: {
			resetRollHistory?: boolean;
		},
	): Promise<void> {
		const shouldResetRollHistory = options?.resetRollHistory === true || mode !== 'active';
		await this.save({
			...this.state,
			mode: session ? mode : 'idle',
			activeSession: mode === 'active' ? session : null,
			sessionRollHistory: shouldResetRollHistory ? [] : this.state.sessionRollHistory,
		});
	}

	async updateActiveSession(
		updater: (session: ActiveSessionState) => ActiveSessionState,
	): Promise<void> {
		if (this.state.mode !== 'active' || !this.state.activeSession) return;
		await this.save({
			...this.state,
			mode: 'active',
			activeSession: updater(this.state.activeSession),
		});
	}

	async setCombatState(input: {
		combatants: SessionCombatantState[];
		currentRound: number;
		activeCombatantIndex: number;
		combatActive?: boolean;
		selectedCombatantId?: string | null;
		referenceObjectId?: string | null;
	}): Promise<void> {
		await this.updateActiveSession((session) => ({
			...session,
			combatants: [...input.combatants],
			currentRound: input.currentRound,
			activeCombatantIndex: input.activeCombatantIndex,
			combatActive: input.combatActive ?? input.combatants.length > 0,
			selectedCombatantId:
				input.selectedCombatantId !== undefined
					? input.selectedCombatantId
					: session.selectedCombatantId,
			referenceObjectId:
				input.referenceObjectId !== undefined ? input.referenceObjectId : session.referenceObjectId,
		}));
	}

	async setCombatSelection(selectedCombatantId: string | null): Promise<void> {
		await this.updateActiveSession((session) => ({
			...session,
			selectedCombatantId,
		}));
	}

	async setCombatReferenceObjectId(referenceObjectId: string | null): Promise<void> {
		await this.updateActiveSession((session) => ({
			...session,
			referenceObjectId,
		}));
	}

	async appendSessionRoll(entry: SessionRollHistoryEntry): Promise<void> {
		if (this.state.mode !== 'active' || !this.state.activeSession) return;
		await this.save({
			...this.state,
			sessionRollHistory: [entry, ...this.state.sessionRollHistory]
				.sort((left, right) => right.at.localeCompare(left.at))
				.slice(0, 300),
		});
	}

	async renameSessionRollEntry(entryId: string, label: string | null): Promise<void> {
		const normalizedId = entryId.trim();
		if (!normalizedId) return;
		const normalizedLabel = label?.trim() || null;
		const nextHistory = this.state.sessionRollHistory.map((entry) =>
			entry.id === normalizedId ? { ...entry, label: normalizedLabel } : entry,
		);
		await this.save({
			...this.state,
			sessionRollHistory: nextHistory,
		});
	}

	async clearSessionRollHistory(): Promise<void> {
		if (this.state.sessionRollHistory.length === 0) return;
		await this.save({
			...this.state,
			sessionRollHistory: [],
		});
	}

	async togglePinnedRollableTable(tableId: string): Promise<void> {
		const normalized = tableId.trim();
		if (!normalized) return;
		const next = this.state.pinnedRollableTableIds.includes(normalized)
			? this.state.pinnedRollableTableIds.filter((entry) => entry !== normalized)
			: [...this.state.pinnedRollableTableIds, normalized];
		await this.save({
			...this.state,
			pinnedRollableTableIds: next,
		});
	}
}

export const sessionState = new SessionStateStore();
