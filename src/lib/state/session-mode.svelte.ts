import { nowISO } from '$lib/utils/date.js';
import { sessionState } from '$lib/state/session-state.svelte.js';
import type { SessionBoardId } from '$lib/types/session-board.js';
import type {
	ActiveSessionState,
	SessionRollDetail,
	SessionRollHistoryEntry,
	SessionNaturalResult,
} from '$lib/types/session-state.js';

interface DiceLikeHistoryEntry {
	id: string;
	at: string;
	source: string;
	expression: string;
	totalText: string;
	breakdown: string;
	rolls: Array<{
		notation: string;
		rolls: number[];
		kept: number[];
		keptIndices: number[];
		subtotal: number;
	}>;
}

const NAT20_VALUE = 20;
const NAT1_VALUE = 1;

function normalizeRollDetails(input: DiceLikeHistoryEntry['rolls']): SessionRollDetail[] {
	return input.map((entry) => ({
		notation: entry.notation,
		rolls: [...entry.rolls],
		kept: [...entry.kept],
		keptIndices: [...entry.keptIndices],
		subtotal: entry.subtotal,
	}));
}

function naturalResultFromRollDetails(rolls: SessionRollDetail[]): SessionNaturalResult {
	const d20 = rolls.find((entry) => entry.notation.toLowerCase().includes('d20'));
	if (!d20 || d20.kept.length !== 1) return null;
	const keptValue = d20.kept[0];
	if (keptValue === NAT20_VALUE) return 'nat20';
	if (keptValue === NAT1_VALUE) return 'nat1';
	return null;
}

class SessionModeState {
	loaded = $derived(sessionState.loaded);
	mode = $derived(sessionState.mode);
	activeSession = $derived(sessionState.activeSession);
	rollHistory = $derived(sessionState.sessionRollHistory);
	pinnedRollableTableIds = $derived(sessionState.pinnedRollableTableIds);
	isActive = $derived(this.mode === 'active' && this.activeSession !== null);
	elapsedMs = $derived.by(() => {
		const activeSession = this.activeSession;
		if (!activeSession) return 0;
		const startedMs = Date.parse(activeSession.startedAt);
		if (!Number.isFinite(startedMs)) return 0;
		return Math.max(0, Date.now() - startedMs);
	});

	async load(): Promise<void> {
		if (sessionState.loaded || sessionState.loading) return;
		await sessionState.load();
	}

	async startSession(input: {
		sessionBoardId: SessionBoardId;
		startedAt?: string;
		sceneId?: string | null;
		combatActive?: boolean;
	}): Promise<void> {
		const next: ActiveSessionState = {
			sessionBoardId: String(input.sessionBoardId),
			startedAt: input.startedAt ?? nowISO(),
			sceneId: input.sceneId ?? null,
			combatActive: input.combatActive === true,
		};
		await sessionState.setSessionMode('active', next, { resetRollHistory: true });
	}

	async endSession(): Promise<void> {
		await sessionState.setSessionMode('idle', null, { resetRollHistory: true });
	}

	async setSceneId(sceneId: string | null): Promise<void> {
		const activeSession = this.activeSession;
		if (!activeSession) return;
		await sessionState.setSessionMode('active', {
			...activeSession,
			sceneId: sceneId?.trim() || null,
		});
	}

	async setCombatActive(combatActive: boolean): Promise<void> {
		const activeSession = this.activeSession;
		if (!activeSession || activeSession.combatActive === combatActive) return;
		await sessionState.setSessionMode('active', {
			...activeSession,
			combatActive,
		});
	}

	async recordDiceRoll(entry: DiceLikeHistoryEntry): Promise<void> {
		if (!this.isActive) return;
		const normalizedRolls = normalizeRollDetails(entry.rolls);
		const sessionEntry: SessionRollHistoryEntry = {
			id: entry.id,
			at: entry.at,
			kind: 'dice',
			source: entry.source,
			expression: entry.expression,
			result: entry.totalText,
			breakdown: entry.breakdown,
			rolls: normalizedRolls,
			label: null,
			naturalResult: naturalResultFromRollDetails(normalizedRolls),
		};
		await sessionState.appendSessionRoll(sessionEntry);
	}

	async recordTableRoll(input: {
		id: string;
		at?: string;
		source?: string;
		tableName: string;
		result: string;
	}): Promise<void> {
		if (!this.isActive) return;
		const normalizedId = input.id.trim();
		const tableName = input.tableName.trim();
		const result = input.result.trim();
		if (!normalizedId || !tableName || !result) return;
		await sessionState.appendSessionRoll({
			id: normalizedId,
			at: input.at ?? nowISO(),
			kind: 'table',
			source: input.source?.trim() || 'table',
			expression: tableName,
			result,
			breakdown: '',
			rolls: [],
			label: null,
			naturalResult: null,
		});
	}

	async renameRollEntry(entryId: string, label: string | null): Promise<void> {
		await sessionState.renameSessionRollEntry(entryId, label);
	}

	async togglePinnedRollableTable(tableId: string): Promise<void> {
		await sessionState.togglePinnedRollableTable(tableId);
	}

	formatRollHistoryForSummary(): string {
		if (this.rollHistory.length === 0) return '';
		const lines = ['## Session Roll Log'];
		for (const entry of [...this.rollHistory].reverse()) {
			const labelPrefix = entry.label ? `${entry.label}: ` : '';
			const at = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			lines.push(`- ${at} ${labelPrefix}${entry.expression} -> ${entry.result}`);
		}
		return lines.join('\n');
	}
}

export const sessionModeState = new SessionModeState();
