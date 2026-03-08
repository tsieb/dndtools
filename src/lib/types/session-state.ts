import type { VaultObjectId } from './object.js';

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

export const SESSION_CONDITION_NAMES = [
	'Blinded',
	'Charmed',
	'Frightened',
	'Grappled',
	'Incapacitated',
	'Invisible',
	'Paralyzed',
	'Petrified',
	'Poisoned',
	'Prone',
	'Restrained',
	'Stunned',
	'Unconscious',
] as const;

export type SessionConditionName = (typeof SESSION_CONDITION_NAMES)[number];
export type SessionCombatantKind = 'pc' | 'npc' | 'creature';

export interface SessionCombatCondition {
	name: SessionConditionName;
	roundsRemaining: number | null;
}

export interface SessionCombatantState {
	id: string;
	name: string;
	kind: SessionCombatantKind;
	initiative: number | null;
	currentHp: number;
	maxHp: number;
	tempHp: number;
	conditions: SessionCombatCondition[];
	linkedObjectId?: VaultObjectId;
	linkedObjectType?: 'stat_block' | 'character';
	linkedObjectName?: string;
}

export interface ActiveSessionState {
	sessionBoardId: string;
	startedAt: string;
	sceneId: string | null;
	combatActive: boolean;
	combatants: SessionCombatantState[];
	currentRound: number;
	activeCombatantIndex: number;
	selectedCombatantId: string | null;
	referenceObjectId: string | null;
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

function toNullableInt(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return Math.trunc(parsed);
		}
	}
	return null;
}

const CONDITION_NAME_SET = new Set<string>(SESSION_CONDITION_NAMES);

function normalizeSessionCombatCondition(value: unknown): SessionCombatCondition | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const nameRaw = toOptionalTrimmedString(source.name);
	if (!nameRaw || !CONDITION_NAME_SET.has(nameRaw)) return null;
	const rounds = toNullableInt(source.roundsRemaining);
	return {
		name: nameRaw as SessionConditionName,
		roundsRemaining: rounds === null ? null : Math.max(1, Math.min(999, rounds)),
	};
}

function normalizeSessionCombatantState(value: unknown): SessionCombatantState | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const id = toOptionalTrimmedString(source.id);
	const name = toOptionalTrimmedString(source.name);
	if (!id || !name) return null;
	const maxHpRaw = toNullableInt(source.maxHp);
	const maxHp = Math.max(1, maxHpRaw ?? 1);
	const currentHpRaw = toNullableInt(source.currentHp);
	const currentHp = Math.max(0, Math.min(maxHp, currentHpRaw ?? maxHp));
	const tempHpRaw = toNullableInt(source.tempHp);
	const tempHp = Math.max(0, tempHpRaw ?? 0);
	const kind: SessionCombatantKind =
		source.kind === 'pc' || source.kind === 'npc' ? source.kind : 'creature';
	const initiative = toNullableInt(source.initiative);
	const conditionList = Array.isArray(source.conditions) ? source.conditions : [];
	const seen = new Set<string>();
	const conditions = conditionList
		.map((entry) => normalizeSessionCombatCondition(entry))
		.filter((entry): entry is SessionCombatCondition => entry !== null)
		.filter((entry) => {
			const key = entry.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, 24);
	return {
		id,
		name,
		kind,
		initiative,
		currentHp,
		maxHp,
		tempHp,
		conditions,
		linkedObjectId: toOptionalTrimmedString(source.linkedObjectId) as VaultObjectId | undefined,
		linkedObjectType:
			source.linkedObjectType === 'stat_block' || source.linkedObjectType === 'character'
				? source.linkedObjectType
				: undefined,
		linkedObjectName: toOptionalTrimmedString(source.linkedObjectName),
	};
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
				const combatants = Array.isArray(session.combatants)
					? session.combatants
							.map((entry) => normalizeSessionCombatantState(entry))
							.filter((entry): entry is SessionCombatantState => entry !== null)
							.slice(0, 200)
					: [];
				const currentRoundRaw = toNullableInt(session.currentRound);
				const currentRound = Math.max(1, currentRoundRaw ?? 1);
				const activeCombatantIndexRaw = toNullableInt(session.activeCombatantIndex);
				const activeCombatantIndex =
					combatants.length === 0
						? 0
						: Math.max(0, Math.min(combatants.length - 1, activeCombatantIndexRaw ?? 0));
				const selectedCombatantIdRaw = toOptionalTrimmedString(session.selectedCombatantId) ?? null;
				const selectedCombatantId =
					selectedCombatantIdRaw &&
					combatants.some((combatant) => combatant.id === selectedCombatantIdRaw)
						? selectedCombatantIdRaw
						: null;
				activeSession = {
					sessionBoardId,
					startedAt,
					sceneId: toOptionalTrimmedString(session.sceneId) ?? null,
					combatActive: combatants.length > 0 && session.combatActive === true,
					combatants,
					currentRound,
					activeCombatantIndex,
					selectedCombatantId,
					referenceObjectId: toOptionalTrimmedString(session.referenceObjectId) ?? null,
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
