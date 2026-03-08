export interface SessionPartyLocation {
	mapId: string;
	x: number;
	y: number;
	poiId?: string;
	source: 'poi' | 'point';
	updatedAt: string;
}

export interface SessionRollDetail {
	notation: string;
	rolls: number[];
	kept: number[];
	keptIndices: number[];
	subtotal: number;
}

export type SessionRollKind = 'dice' | 'table';

export type SessionNaturalResult = 'nat20' | 'nat1' | null;

export interface SessionRollHistoryEntry {
	id: string;
	at: string;
	kind: SessionRollKind;
	source: string;
	expression: string;
	result: string;
	breakdown: string;
	rolls: SessionRollDetail[];
	label: string | null;
	naturalResult: SessionNaturalResult;
}

export type SessionMode = 'idle' | 'active';

export interface ActiveSessionState {
	sessionBoardId: string;
	startedAt: string;
	sceneId: string | null;
	combatActive: boolean;
}

export interface SessionState {
	version: 1;
	partyLocation: SessionPartyLocation | null;
	mode: SessionMode;
	activeSession: ActiveSessionState | null;
	sessionRollHistory: SessionRollHistoryEntry[];
	pinnedRollableTableIds: string[];
}

export const DEFAULT_SESSION_STATE: SessionState = {
	version: 1,
	partyLocation: null,
	mode: 'idle',
	activeSession: null,
	sessionRollHistory: [],
	pinnedRollableTableIds: [],
};

function clamp01(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.min(1, Math.max(0, value));
	}
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return Math.min(1, Math.max(0, parsed));
		}
	}
	return null;
}

function toOptionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function normalizeRollDetail(value: unknown): SessionRollDetail | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const notation = toOptionalTrimmedString(source.notation);
	if (!notation) return null;
	const rolls = Array.isArray(source.rolls)
		? source.rolls
				.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
				.map((entry) => Math.trunc(entry))
		: [];
	const keptIndices = Array.isArray(source.keptIndices)
		? source.keptIndices
				.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
				.map((entry) => Math.max(0, Math.trunc(entry)))
		: [];
	const kept = Array.isArray(source.kept)
		? source.kept
				.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
				.map((entry) => Math.trunc(entry))
		: keptIndices
				.map((index) => rolls[index])
				.filter((entry): entry is number => entry !== undefined);
	const subtotal =
		typeof source.subtotal === 'number' && Number.isFinite(source.subtotal)
			? Math.trunc(source.subtotal)
			: kept.reduce((sum, entry) => sum + entry, 0);
	return {
		notation,
		rolls,
		kept,
		keptIndices,
		subtotal,
	};
}

function normalizeSessionRollHistoryEntry(value: unknown): SessionRollHistoryEntry | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const id = toOptionalTrimmedString(source.id);
	const at = toOptionalTrimmedString(source.at);
	const expression = toOptionalTrimmedString(source.expression);
	const result = toOptionalTrimmedString(source.result);
	if (!id || !at || !expression || !result) return null;
	const kind: SessionRollKind = source.kind === 'table' ? 'table' : 'dice';
	const sourceLabel = toOptionalTrimmedString(source.source) ?? 'unknown';
	const label = toOptionalTrimmedString(source.label) ?? null;
	const breakdown = toOptionalTrimmedString(source.breakdown) ?? '';
	const rolls = Array.isArray(source.rolls)
		? source.rolls
				.map((entry) => normalizeRollDetail(entry))
				.filter((entry): entry is SessionRollDetail => entry !== null)
		: [];
	const naturalResult: SessionNaturalResult =
		source.naturalResult === 'nat20' || source.naturalResult === 'nat1'
			? source.naturalResult
			: null;
	return {
		id,
		at,
		kind,
		source: sourceLabel,
		expression,
		result,
		breakdown,
		rolls,
		label,
		naturalResult,
	};
}

export function normalizeSessionState(value: unknown): SessionState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ...DEFAULT_SESSION_STATE };
	}
	const source = value as Record<string, unknown>;
	const locationRaw = source.partyLocation;
	let partyLocation: SessionPartyLocation | null = null;
	if (locationRaw && typeof locationRaw === 'object' && !Array.isArray(locationRaw)) {
		const location = locationRaw as Record<string, unknown>;
		const mapId = toOptionalTrimmedString(location.mapId);
		const x = clamp01(location.x);
		const y = clamp01(location.y);
		if (mapId && x !== null && y !== null) {
			partyLocation = {
				mapId,
				x,
				y,
				poiId: toOptionalTrimmedString(location.poiId),
				source: location.source === 'poi' ? 'poi' : 'point',
				updatedAt: toOptionalTrimmedString(location.updatedAt) ?? new Date().toISOString(),
			};
		}
	}

	const mode = source.mode === 'active' ? 'active' : 'idle';
	let activeSession: ActiveSessionState | null = null;
	if (mode === 'active') {
		const rawActive = source.activeSession;
		if (rawActive && typeof rawActive === 'object' && !Array.isArray(rawActive)) {
			const session = rawActive as Record<string, unknown>;
			const sessionBoardId = toOptionalTrimmedString(session.sessionBoardId);
			const startedAt = toOptionalTrimmedString(session.startedAt);
			if (sessionBoardId && startedAt) {
				activeSession = {
					sessionBoardId,
					startedAt,
					sceneId: toOptionalTrimmedString(session.sceneId) ?? null,
					combatActive: session.combatActive === true,
				};
			}
		}
	}

	const sessionRollHistory = Array.isArray(source.sessionRollHistory)
		? source.sessionRollHistory
				.map((entry) => normalizeSessionRollHistoryEntry(entry))
				.filter((entry): entry is SessionRollHistoryEntry => entry !== null)
				.sort((left, right) => right.at.localeCompare(left.at))
				.slice(0, 300)
		: [];

	const pinnedRollableTableIds = Array.isArray(source.pinnedRollableTableIds)
		? [
				...new Set(
					source.pinnedRollableTableIds
						.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
						.filter((entry) => entry.length > 0),
				),
			]
		: [];

	return {
		version: 1,
		partyLocation,
		mode: activeSession ? 'active' : 'idle',
		activeSession,
		sessionRollHistory: activeSession ? sessionRollHistory : [],
		pinnedRollableTableIds,
	};
}
