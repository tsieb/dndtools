import {
	buildXpAwards,
	estimateEncounterTreasureTier,
	getTreasureTableNameForTier,
	parseChallengeRating,
	type EncounterXpAward,
} from '$lib/domain/encounter-builder.js';
import type {
	CombatantOutcome,
	EncounterNotableRollKind,
	SessionBoardCombatMapHistoryEntry,
	SessionBoardCombatMapState,
	SessionBoardCombatMapTemplate,
	SessionBoardCombatMapTerrainCell,
	SessionBoardCombatMapToken,
	SessionBoardCombatLairAction,
	SessionBoardCombatLairTracker,
	SessionBoardCombatLegendaryAction,
	SessionBoardCombatLegendaryTracker,
	SessionBoardCombatNotableRoll,
	SessionBoardCombatState,
	SessionBoardCombatant,
	SessionBoardDeathSaves,
	SessionBoardLinkedStatsPreview,
} from '$lib/types/session-board.js';
import type { VaultObject, VaultObjectId } from '$lib/types/object.js';
import { nowISO } from '$lib/utils/date.js';

export const DND5E_CONDITIONS = [
	'Blinded',
	'Charmed',
	'Deafened',
	'Exhaustion',
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

const GENERIC_CONDITIONS = ['Stressed', 'Wounded', 'Distracted', 'Empowered', 'Weakened'] as const;
const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 4_000;
const MAX_LOOT_LENGTH = 2_000;
const MAX_OUTCOME_LENGTH = 600;
const MAX_DAMAGE = 99_999;
const MAX_NOTABLE_ROLLS = 200;
const MAX_COMBAT_MAP_TOKENS = 300;
const MAX_COMBAT_MAP_TERRAIN_CELLS = 20_000;
const MAX_COMBAT_MAP_TEMPLATES = 100;
const MAX_COMBAT_MAP_HISTORY = 800;

function clampInt(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

function asFiniteNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return value;
}

function asNullableInt(value: unknown): number | null {
	const numeric = asFiniteNumber(value);
	return numeric === null ? null : Math.round(numeric);
}

function asNonNegativeInt(value: unknown, fallback = 0): number {
	const numeric = asFiniteNumber(value);
	if (numeric === null) return fallback;
	return Math.max(0, Math.round(numeric));
}

function asInt(value: unknown, fallback = 0): number {
	const numeric = asFiniteNumber(value);
	if (numeric === null) return fallback;
	return Math.round(numeric);
}

function normalizeText(value: unknown, maxLength: number): string {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, maxLength);
}

function normalizeConditionList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') continue;
		const condition = entry.trim();
		if (!condition) continue;
		const key = condition.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(condition.slice(0, 64));
	}
	return normalized.slice(0, 24);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCombatantOutcome(value: unknown): value is CombatantOutcome {
	return value === 'active' || value === 'fell' || value === 'fled';
}

function normalizeNotableRollKind(value: unknown): EncounterNotableRollKind | null {
	if (
		value === 'critical_hit' ||
		value === 'critical_failure' ||
		value === 'death_save_success' ||
		value === 'death_save_failure'
	) {
		return value;
	}
	return null;
}

export function createDefaultDeathSaves(): SessionBoardDeathSaves {
	return { successes: 0, failures: 0 };
}

function normalizeDeathSaves(value: unknown): SessionBoardDeathSaves {
	if (!isRecord(value)) return createDefaultDeathSaves();
	return {
		successes: clampInt(asNonNegativeInt(value.successes), 0, 3),
		failures: clampInt(asNonNegativeInt(value.failures), 0, 3),
	};
}

function normalizeStatsPreview(value: unknown): SessionBoardLinkedStatsPreview | undefined {
	if (!isRecord(value)) return undefined;
	const normalizeList = (input: unknown): string[] => {
		if (!Array.isArray(input)) return [];
		return input
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.slice(0, 12);
	};
	return {
		size: normalizeText(value.size, 60) || undefined,
		creatureType: normalizeText(value.creatureType, 60) || undefined,
		alignment: normalizeText(value.alignment, 60) || undefined,
		challengeRating: normalizeText(value.challengeRating, 30) || undefined,
		speed: normalizeText(value.speed, 60) || undefined,
		proficiencyBonus: normalizeText(value.proficiencyBonus, 16) || undefined,
		className: normalizeText(value.className, 60) || undefined,
		level: asNonNegativeInt(value.level, 0) || undefined,
		traits: normalizeList(value.traits),
		actions: normalizeList(value.actions),
		reactions: normalizeList(value.reactions),
		legendaryActions: normalizeList(value.legendaryActions),
	};
}

function normalizeLegendaryAction(
	value: unknown,
	index: number,
): SessionBoardCombatLegendaryAction | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, MAX_NAME_LENGTH);
	if (!name) return null;
	return {
		id: normalizeText(value.id, 80) || `legendary-action-${index + 1}`,
		name,
		cost: clampInt(Number(value.cost) || 1, 1, 5),
		usedCount: clampInt(Number(value.usedCount) || 0, 0, 99_999),
	};
}

function normalizeLairAction(value: unknown, index: number): SessionBoardCombatLairAction | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, MAX_NAME_LENGTH);
	if (!name) return null;
	return {
		id: normalizeText(value.id, 80) || `lair-action-${index + 1}`,
		name,
		description: normalizeText(value.description, 600) || undefined,
		autoTrigger: value.autoTrigger === true,
		usedCount: clampInt(Number(value.usedCount) || 0, 0, 99_999),
	};
}
function normalizeNotableRoll(value: unknown, index: number): SessionBoardCombatNotableRoll | null {
	if (!isRecord(value)) return null;
	const kind = normalizeNotableRollKind(value.kind);
	if (!kind) return null;
	const combatantName = normalizeText(value.combatantName, MAX_NAME_LENGTH);
	if (!combatantName) return null;
	return {
		id: normalizeText(value.id, 80) || `notable-roll-${index + 1}`,
		kind,
		combatantName,
		combatantId: normalizeText(value.combatantId, 80) || undefined,
		round: clampInt(Number(value.round) || 1, 1, 999),
		note: normalizeText(value.note, 220) || undefined,
		recordedAt: normalizeText(value.recordedAt, 120) || nowISO(),
	};
}

function normalizeCombatMapToken(
	value: unknown,
	_index: number,
	combatants: readonly SessionBoardCombatant[],
): SessionBoardCombatMapToken | null {
	if (!isRecord(value)) return null;
	const combatantId = normalizeText(value.combatantId, 80);
	if (!combatantId || !combatants.some((combatant) => combatant.id === combatantId)) return null;
	const x = asNullableInt(value.x);
	const y = asNullableInt(value.y);
	if (x === null || y === null) return null;
	return {
		combatantId,
		x: clampInt(x, -10_000, 10_000),
		y: clampInt(y, -10_000, 10_000),
		imageUrl: normalizeText(value.imageUrl, 600) || undefined,
		initials: normalizeText(value.initials, 8) || undefined,
	};
}

function normalizeCombatMapTerrainCell(
	value: unknown,
	_index: number,
): SessionBoardCombatMapTerrainCell | null {
	if (!isRecord(value)) return null;
	const x = asNullableInt(value.x);
	const y = asNullableInt(value.y);
	if (x === null || y === null) return null;
	return {
		x: clampInt(x, -10_000, 10_000),
		y: clampInt(y, -10_000, 10_000),
	};
}

function normalizeCombatMapTemplate(
	value: unknown,
	index: number,
): SessionBoardCombatMapTemplate | null {
	if (!isRecord(value)) return null;
	const shape =
		value.shape === 'sphere' ||
		value.shape === 'cone' ||
		value.shape === 'line' ||
		value.shape === 'cube'
			? value.shape
			: null;
	if (!shape) return null;
	const originX = asNullableInt(value.originX);
	const originY = asNullableInt(value.originY);
	const targetX = asNullableInt(value.targetX);
	const targetY = asNullableInt(value.targetY);
	if (originX === null || originY === null || targetX === null || targetY === null) return null;
	return {
		id: normalizeText(value.id, 80) || `template-${index + 1}`,
		shape,
		originX: clampInt(originX, -10_000, 10_000),
		originY: clampInt(originY, -10_000, 10_000),
		targetX: clampInt(targetX, -10_000, 10_000),
		targetY: clampInt(targetY, -10_000, 10_000),
		radiusSquares:
			shape === 'sphere' || shape === 'cone' || shape === 'cube'
				? clampInt(Number(value.radiusSquares) || 1, 1, 200)
				: undefined,
		widthSquares: shape === 'line' ? clampInt(Number(value.widthSquares) || 1, 1, 50) : undefined,
		lengthSquares:
			shape === 'line' ? clampInt(Number(value.lengthSquares) || 6, 1, 500) : undefined,
		label: normalizeText(value.label, 120) || undefined,
		createdAt: normalizeText(value.createdAt, 120) || nowISO(),
	};
}

function normalizeCombatMapHistoryEntry(
	value: unknown,
	index: number,
	combatants: readonly SessionBoardCombatant[],
): SessionBoardCombatMapHistoryEntry | null {
	if (!isRecord(value)) return null;
	const kind =
		value.kind === 'movement' ||
		value.kind === 'status' ||
		value.kind === 'terrain' ||
		value.kind === 'template' ||
		value.kind === 'sync'
			? value.kind
			: null;
	if (!kind) return null;
	const message = normalizeText(value.message, 300);
	if (!message) return null;
	const combatantId = normalizeText(value.combatantId, 80);
	return {
		id: normalizeText(value.id, 80) || `map-history-${index + 1}`,
		at: normalizeText(value.at, 120) || nowISO(),
		kind,
		message,
		combatantId:
			combatantId && combatants.some((combatant) => combatant.id === combatantId)
				? combatantId
				: undefined,
	};
}

export function createDefaultCombatMapState(): SessionBoardCombatMapState {
	return {
		mapId: null,
		tokens: [],
		difficultTerrain: [],
		templates: [],
		selectedCombatantId: null,
		history: [],
	};
}

function normalizeCombatMapState(
	value: unknown,
	combatants: readonly SessionBoardCombatant[],
	activeCombatantId: string | null,
): SessionBoardCombatMapState {
	if (!isRecord(value)) return createDefaultCombatMapState();
	const tokensRaw = Array.isArray(value.tokens) ? value.tokens : [];
	const seenTokenCombatants = new Set<string>();
	const tokens: SessionBoardCombatMapToken[] = [];
	for (const [index, entry] of tokensRaw.entries()) {
		const normalized = normalizeCombatMapToken(entry, index, combatants);
		if (!normalized) continue;
		if (seenTokenCombatants.has(normalized.combatantId)) continue;
		seenTokenCombatants.add(normalized.combatantId);
		tokens.push(normalized);
		if (tokens.length >= MAX_COMBAT_MAP_TOKENS) break;
	}

	const terrainRaw = Array.isArray(value.difficultTerrain) ? value.difficultTerrain : [];
	const seenTerrain = new Set<string>();
	const difficultTerrain: SessionBoardCombatMapTerrainCell[] = [];
	for (const [index, entry] of terrainRaw.entries()) {
		const normalized = normalizeCombatMapTerrainCell(entry, index);
		if (!normalized) continue;
		const key = `${normalized.x},${normalized.y}`;
		if (seenTerrain.has(key)) continue;
		seenTerrain.add(key);
		difficultTerrain.push(normalized);
		if (difficultTerrain.length >= MAX_COMBAT_MAP_TERRAIN_CELLS) break;
	}

	const templatesRaw = Array.isArray(value.templates) ? value.templates : [];
	const templates = templatesRaw
		.map((entry, index) => normalizeCombatMapTemplate(entry, index))
		.filter((entry): entry is SessionBoardCombatMapTemplate => !!entry)
		.slice(0, MAX_COMBAT_MAP_TEMPLATES);

	const historyRaw = Array.isArray(value.history) ? value.history : [];
	const history = historyRaw
		.map((entry, index) => normalizeCombatMapHistoryEntry(entry, index, combatants))
		.filter((entry): entry is SessionBoardCombatMapHistoryEntry => !!entry)
		.slice(-MAX_COMBAT_MAP_HISTORY);

	const requestedSelectedCombatantId = normalizeText(value.selectedCombatantId, 80);
	const selectedCombatantId =
		activeCombatantId && combatants.some((combatant) => combatant.id === activeCombatantId)
			? activeCombatantId
			: requestedSelectedCombatantId &&
				  combatants.some((combatant) => combatant.id === requestedSelectedCombatantId)
				? requestedSelectedCombatantId
				: null;

	const fogState =
		isRecord(value.fogState) && Array.isArray(value.fogState.revealedPolygons)
			? {
					revealedPolygons: value.fogState.revealedPolygons
						.map((polygon) => {
							if (!isRecord(polygon) || !Array.isArray(polygon.points)) return null;
							const points = polygon.points
								.map((point) => {
									if (!isRecord(point)) return null;
									const x = asFiniteNumber(point.x);
									const y = asFiniteNumber(point.y);
									if (x === null || y === null) return null;
									return {
										x: Math.max(0, Math.min(1, x)),
										y: Math.max(0, Math.min(1, y)),
									};
								})
								.filter((point): point is { x: number; y: number } => !!point)
								.slice(0, 2_000);
							if (points.length < 3) return null;
							return { points };
						})
						.filter((polygon): polygon is { points: Array<{ x: number; y: number }> } => !!polygon)
						.slice(0, 500),
				}
			: undefined;

	return {
		mapId: normalizeText(value.mapId, 120) || null,
		tokens,
		difficultTerrain,
		templates,
		selectedCombatantId,
		history,
		fogState,
	};
}

function compareCombatants(a: SessionBoardCombatant, b: SessionBoardCombatant): number {
	const aInit = a.initiative ?? Number.NEGATIVE_INFINITY;
	const bInit = b.initiative ?? Number.NEGATIVE_INFINITY;
	if (aInit !== bInit) return bInit - aInit;
	if (a.tieRank !== b.tieRank) return a.tieRank - b.tieRank;
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function normalizeTieRanks(combatants: SessionBoardCombatant[]): SessionBoardCombatant[] {
	const byInitiative = new Map<string, SessionBoardCombatant[]>();
	for (const combatant of combatants) {
		const key = combatant.initiative === null ? 'null' : String(combatant.initiative);
		const current = byInitiative.get(key);
		if (current) current.push(combatant);
		else byInitiative.set(key, [combatant]);
	}

	const nextById = new Map<string, number>();
	for (const group of byInitiative.values()) {
		const ordered = [...group].sort((a, b) => a.tieRank - b.tieRank || compareCombatants(a, b));
		for (const [index, combatant] of ordered.entries()) {
			nextById.set(combatant.id, index);
		}
	}

	return combatants.map((combatant) => ({
		...combatant,
		tieRank: nextById.get(combatant.id) ?? 0,
	}));
}

function normalizeCombatant(value: unknown, index: number): SessionBoardCombatant {
	const source = isRecord(value) ? value : {};
	const idRaw = normalizeText(source.id, 80);
	const maxHp = asNullableInt(source.maxHp);
	const currentHp = asNullableInt(source.currentHp);
	const normalizedMaxHp = maxHp === null ? null : Math.max(0, maxHp);
	const normalizedCurrentHp =
		currentHp === null
			? normalizedMaxHp
			: normalizedMaxHp === null
				? Math.max(0, currentHp)
				: clampInt(currentHp, 0, normalizedMaxHp);
	const sourceStartingHp = asNullableInt(source.startingHp);
	const startingHp =
		sourceStartingHp === null
			? normalizedCurrentHp
			: normalizedMaxHp === null
				? Math.max(0, sourceStartingHp)
				: clampInt(sourceStartingHp, 0, normalizedMaxHp);

	return {
		id: idRaw || `combatant-${index + 1}`,
		name: normalizeText(source.name, MAX_NAME_LENGTH) || `Combatant ${index + 1}`,
		initiative: asNullableInt(source.initiative),
		initiativeModifier: clampInt(asInt(source.initiativeModifier, 0), -20, 20),
		tieRank: asNonNegativeInt(source.tieRank, index),
		ready: source.ready === true,
		delayed: source.delayed === true,
		isPlayerCharacter: source.isPlayerCharacter === true,
		currentHp: normalizedCurrentHp,
		maxHp: normalizedMaxHp,
		armorClass: asNullableInt(source.armorClass),
		conditions: normalizeConditionList(source.conditions),
		concentration: source.concentration === true,
		deathSaves: normalizeDeathSaves(source.deathSaves),
		outcome: isCombatantOutcome(source.outcome) ? source.outcome : 'active',
		damageDealt: clampInt(asNonNegativeInt(source.damageDealt, 0), 0, MAX_DAMAGE),
		startingHp,
		linkedObjectId:
			typeof source.linkedObjectId === 'string' && source.linkedObjectId.trim()
				? (source.linkedObjectId as VaultObjectId)
				: undefined,
		linkedObjectType:
			source.linkedObjectType === 'stat_block' || source.linkedObjectType === 'character'
				? source.linkedObjectType
				: undefined,
		linkedObjectName: normalizeText(source.linkedObjectName, MAX_NAME_LENGTH) || undefined,
		statsPreview: normalizeStatsPreview(source.statsPreview),
		statsExpanded: source.statsExpanded === true,
	};
}

function defaultLegendaryTrackerForCombatant(
	combatant: SessionBoardCombatant,
): SessionBoardCombatLegendaryTracker | null {
	const legendaryActions = combatant.statsPreview?.legendaryActions ?? [];
	if (legendaryActions.length === 0) return null;
	return {
		combatantId: combatant.id,
		combatantName: combatant.name,
		chargesMax: 3,
		chargesRemaining: 3,
		actions: legendaryActions.map((name, index) => ({
			id: `${combatant.id}-legendary-${index + 1}`,
			name: normalizeText(name, MAX_NAME_LENGTH),
			cost: 1,
			usedCount: 0,
		})),
	};
}

function normalizeLegendaryTracker(
	value: unknown,
	index: number,
	combatants: readonly SessionBoardCombatant[],
): SessionBoardCombatLegendaryTracker | null {
	if (!isRecord(value)) return null;
	const combatantId = normalizeText(value.combatantId, 80);
	if (!combatantId || !combatants.some((combatant) => combatant.id === combatantId)) return null;
	const actionsRaw = Array.isArray(value.actions) ? value.actions : [];
	const actions = actionsRaw
		.map((entry, actionIndex) => normalizeLegendaryAction(entry, actionIndex))
		.filter((entry): entry is SessionBoardCombatLegendaryAction => !!entry)
		.slice(0, 24);
	if (actions.length === 0) return null;
	const chargesMax = clampInt(Number(value.chargesMax) || 3, 1, 9);
	return {
		combatantId,
		combatantName:
			normalizeText(value.combatantName, MAX_NAME_LENGTH) ||
			combatants.find((combatant) => combatant.id === combatantId)?.name ||
			`Legendary Creature ${index + 1}`,
		chargesMax,
		chargesRemaining: clampInt(Number(value.chargesRemaining) || chargesMax, 0, chargesMax),
		actions,
	};
}

function normalizeLairTracker(value: unknown): SessionBoardCombatLairTracker {
	if (!isRecord(value)) {
		return {
			enabled: false,
			initiativeCount: 20,
			lastTriggeredRound: null,
			actions: [],
		};
	}
	const actionsRaw = Array.isArray(value.actions) ? value.actions : [];
	const actions = actionsRaw
		.map((entry, index) => normalizeLairAction(entry, index))
		.filter((entry): entry is SessionBoardCombatLairAction => !!entry)
		.slice(0, 24);
	return {
		enabled: value.enabled === true,
		initiativeCount: clampInt(Number(value.initiativeCount) || 20, 1, 30),
		lastTriggeredRound: clampInt(Number(value.lastTriggeredRound) || 0, 0, 999) || null,
		actions,
	};
}
function syncLegendaryTrackers(
	combatants: readonly SessionBoardCombatant[],
	trackers: readonly SessionBoardCombatLegendaryTracker[],
): SessionBoardCombatLegendaryTracker[] {
	const byCombatantId = new Map(trackers.map((tracker) => [tracker.combatantId, tracker]));
	const next: SessionBoardCombatLegendaryTracker[] = [];
	for (const combatant of combatants) {
		const fromState = byCombatantId.get(combatant.id);
		if (fromState) {
			next.push({
				...fromState,
				combatantName: combatant.name,
				actions: fromState.actions.map((action) => ({ ...action })),
			});
			continue;
		}
		const derived = defaultLegendaryTrackerForCombatant(combatant);
		if (derived) next.push(derived);
	}
	return next.slice(0, 50);
}

export function sortCombatantsForInitiative(
	combatants: SessionBoardCombatant[],
): SessionBoardCombatant[] {
	return normalizeTieRanks([...combatants].sort(compareCombatants));
}

export function createDefaultCombatState(now = nowISO()): SessionBoardCombatState {
	return {
		encounterName: '',
		systemId: 'dnd5e',
		round: 1,
		activeCombatantId: null,
		combatants: [],
		legendaryTrackers: [],
		lairTracker: {
			enabled: false,
			initiativeCount: 20,
			lastTriggeredRound: null,
			actions: [],
		},
		notableRolls: [],
		mapState: createDefaultCombatMapState(),
		outcome: '',
		notes: '',
		loot: '',
		startedAt: now,
		endedAt: null,
		lastLogNoteId: null,
	};
}

export function normalizeCombatState(value: unknown): SessionBoardCombatState {
	if (!isRecord(value)) return createDefaultCombatState();
	const combatantsRaw = Array.isArray(value.combatants) ? value.combatants : [];
	const combatants = sortCombatantsForInitiative(
		combatantsRaw.map((combatant, index) => normalizeCombatant(combatant, index)),
	);
	const activeCombatantIdRaw = normalizeText(value.activeCombatantId, 80);
	const activeCombatantId = combatants.some((combatant) => combatant.id === activeCombatantIdRaw)
		? activeCombatantIdRaw
		: null;
	const round = Math.max(1, asNonNegativeInt(value.round, 1));
	const trackersRaw = Array.isArray(value.legendaryTrackers) ? value.legendaryTrackers : [];
	const trackers = trackersRaw
		.map((entry, index) => normalizeLegendaryTracker(entry, index, combatants))
		.filter((entry): entry is SessionBoardCombatLegendaryTracker => !!entry);
	const legendaryTrackers = syncLegendaryTrackers(combatants, trackers);
	const lairTracker = normalizeLairTracker(value.lairTracker);
	const notableRollsRaw = Array.isArray(value.notableRolls) ? value.notableRolls : [];
	const notableRolls = notableRollsRaw
		.map((entry, index) => normalizeNotableRoll(entry, index))
		.filter((entry): entry is SessionBoardCombatNotableRoll => !!entry)
		.slice(0, MAX_NOTABLE_ROLLS);
	const mapState = normalizeCombatMapState(value.mapState, combatants, activeCombatantId);
	return {
		encounterName: normalizeText(value.encounterName, MAX_NAME_LENGTH),
		systemId: normalizeText(value.systemId, 40) || 'dnd5e',
		round,
		activeCombatantId,
		combatants,
		legendaryTrackers,
		lairTracker,
		notableRolls,
		mapState,
		outcome: normalizeText(value.outcome, MAX_OUTCOME_LENGTH),
		notes: normalizeText(value.notes, MAX_NOTES_LENGTH),
		loot: normalizeText(value.loot, MAX_LOOT_LENGTH),
		startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
		endedAt: typeof value.endedAt === 'string' ? value.endedAt : null,
		lastLogNoteId:
			typeof value.lastLogNoteId === 'string' && value.lastLogNoteId.trim()
				? (value.lastLogNoteId as SessionBoardCombatState['lastLogNoteId'])
				: null,
	};
}

function abilityModifier(score: number | undefined): number | null {
	if (typeof score !== 'number' || !Number.isFinite(score)) return null;
	return Math.floor((score - 10) / 2);
}

function parseStatBlockHitPoints(hitPoints: string | undefined): number | null {
	if (!hitPoints) return null;
	const match = hitPoints.match(/-?\d+/);
	if (!match) return null;
	const parsed = Number.parseInt(match[0], 10);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(0, parsed);
}

export interface LinkedCombatantDefaults {
	maxHp: number | null;
	armorClass: number | null;
	initiativeModifier: number;
	statsPreview: SessionBoardLinkedStatsPreview | undefined;
}

export function getLinkedCombatantDefaults(object: VaultObject): LinkedCombatantDefaults | null {
	if (object.type === 'stat_block') {
		const initiativeModifier = abilityModifier(object.data.abilities.dex) ?? 0;
		return {
			maxHp: parseStatBlockHitPoints(object.data.hitPoints),
			armorClass: object.data.armorClass ?? null,
			initiativeModifier,
			statsPreview: {
				size: object.data.size,
				creatureType: object.data.creatureType,
				alignment: object.data.alignment,
				challengeRating: object.data.challengeRating,
				speed: object.data.speed,
				traits: object.data.traits.map((entry) => entry.name),
				actions: object.data.actions.map((entry) => entry.name),
				reactions: object.data.reactions.map((entry) => entry.name),
				legendaryActions: object.data.legendaryActions.map((entry) => entry.name),
			},
		};
	}
	if (object.type === 'character') {
		const initiativeModifier = abilityModifier(object.data.abilities?.dex) ?? 0;
		return {
			maxHp: object.data.hitPoints ?? null,
			armorClass: object.data.armorClass ?? null,
			initiativeModifier,
			statsPreview: {
				className: object.data.className,
				level: object.data.level,
				speed: object.data.speed,
				proficiencyBonus: object.data.proficiencyBonus,
				traits: object.data.goals.slice(0, 6),
				actions: [],
				reactions: [],
				legendaryActions: [],
			},
		};
	}
	return null;
}
export function reorderTieCombatants(
	combatants: SessionBoardCombatant[],
	draggedId: string,
	targetId: string,
): SessionBoardCombatant[] | null {
	if (draggedId === targetId) return combatants;
	const dragged = combatants.find((combatant) => combatant.id === draggedId);
	const target = combatants.find((combatant) => combatant.id === targetId);
	if (!dragged || !target) return null;
	if (dragged.initiative !== target.initiative) return null;

	const group = sortCombatantsForInitiative(
		combatants.filter((combatant) => combatant.initiative === dragged.initiative),
	);
	const draggedIndex = group.findIndex((combatant) => combatant.id === draggedId);
	const targetIndex = group.findIndex((combatant) => combatant.id === targetId);
	if (draggedIndex < 0 || targetIndex < 0) return null;

	const reordered = [...group];
	const [moved] = reordered.splice(draggedIndex, 1);
	if (!moved) return null;
	reordered.splice(targetIndex, 0, moved);
	const tieRankById = new Map<string, number>();
	for (const [index, combatant] of reordered.entries()) {
		tieRankById.set(combatant.id, index);
	}

	return sortCombatantsForInitiative(
		combatants.map((combatant) => ({
			...combatant,
			tieRank: tieRankById.get(combatant.id) ?? combatant.tieRank,
		})),
	);
}

function isTurnEligible(combatant: SessionBoardCombatant): boolean {
	return !combatant.delayed || combatant.ready;
}

function triggerLairTracker(
	lairTracker: SessionBoardCombatLairTracker,
	input: {
		round: number;
		previousInitiative: number | null;
		nextInitiative: number | null;
		wrapped: boolean;
		autoOnly: boolean;
	},
): SessionBoardCombatLairTracker {
	if (!lairTracker.enabled || lairTracker.actions.length === 0) return lairTracker;
	if (lairTracker.lastTriggeredRound === input.round) return lairTracker;
	const triggerable = input.autoOnly
		? lairTracker.actions.filter((action) => action.autoTrigger)
		: lairTracker.actions;
	if (triggerable.length === 0) return lairTracker;

	let shouldTrigger = false;
	if (input.previousInitiative === null) {
		shouldTrigger =
			input.nextInitiative === null || input.nextInitiative <= lairTracker.initiativeCount;
	} else if (input.wrapped) {
		shouldTrigger =
			input.nextInitiative === null || input.nextInitiative <= lairTracker.initiativeCount;
	} else if (
		input.previousInitiative > lairTracker.initiativeCount &&
		(input.nextInitiative === null || input.nextInitiative <= lairTracker.initiativeCount)
	) {
		shouldTrigger = true;
	}
	if (!shouldTrigger) return lairTracker;

	const triggerableIds = new Set(triggerable.map((action) => action.id));
	return {
		...lairTracker,
		lastTriggeredRound: input.round,
		actions: lairTracker.actions.map((action) =>
			triggerableIds.has(action.id) ? { ...action, usedCount: action.usedCount + 1 } : action,
		),
	};
}

function resetLegendaryTrackersForTurn(
	trackers: readonly SessionBoardCombatLegendaryTracker[],
	activeCombatantId: string,
): SessionBoardCombatLegendaryTracker[] {
	return trackers.map((tracker) =>
		tracker.combatantId !== activeCombatantId
			? tracker
			: {
					...tracker,
					chargesRemaining: tracker.chargesMax,
				},
	);
}

export function startCombatantTurn(
	state: SessionBoardCombatState,
	combatantId: string,
): SessionBoardCombatState {
	const sorted = sortCombatantsForInitiative(state.combatants);
	const nextCombatant = sorted.find((combatant) => combatant.id === combatantId);
	if (!nextCombatant) return state;
	const previousCombatant =
		sorted.find((combatant) => combatant.id === state.activeCombatantId) ?? null;
	const round = Math.max(1, state.round);
	return normalizeCombatState({
		...state,
		combatants: sorted,
		activeCombatantId: nextCombatant.id,
		legendaryTrackers: resetLegendaryTrackersForTurn(state.legendaryTrackers, nextCombatant.id),
		lairTracker: triggerLairTracker(state.lairTracker, {
			round,
			previousInitiative: previousCombatant?.initiative ?? null,
			nextInitiative: nextCombatant.initiative,
			wrapped: false,
			autoOnly: true,
		}),
	});
}

export function advanceCombatTurn(state: SessionBoardCombatState): SessionBoardCombatState {
	const sorted = sortCombatantsForInitiative(state.combatants);
	if (sorted.length === 0) {
		return normalizeCombatState({
			...state,
			combatants: sorted,
			activeCombatantId: null,
		});
	}

	const currentIndex = state.activeCombatantId
		? sorted.findIndex((combatant) => combatant.id === state.activeCombatantId)
		: -1;

	let nextIndex = -1;
	let wrapped = false;
	for (let step = 1; step <= sorted.length; step += 1) {
		const candidateIndex = (currentIndex + step) % sorted.length;
		const candidate = sorted[candidateIndex];
		if (!candidate) continue;
		if (!isTurnEligible(candidate)) continue;
		nextIndex = candidateIndex;
		if (currentIndex >= 0 && candidateIndex <= currentIndex) wrapped = true;
		break;
	}

	if (nextIndex < 0) {
		return normalizeCombatState({
			...state,
			combatants: sorted,
		});
	}

	const nextCombatant = sorted[nextIndex];
	if (!nextCombatant) {
		return normalizeCombatState({
			...state,
			combatants: sorted,
		});
	}

	const nextCombatants = sorted.map((combatant) =>
		combatant.id !== nextCombatant.id || !(combatant.delayed && combatant.ready)
			? combatant
			: { ...combatant, delayed: false, ready: false },
	);
	const previousCombatant = currentIndex >= 0 ? (sorted[currentIndex] ?? null) : null;
	const nextRound = wrapped ? state.round + 1 : state.round;

	return normalizeCombatState({
		...state,
		round: nextRound,
		activeCombatantId: nextCombatant.id,
		combatants: nextCombatants,
		legendaryTrackers: resetLegendaryTrackersForTurn(state.legendaryTrackers, nextCombatant.id),
		lairTracker: triggerLairTracker(state.lairTracker, {
			round: nextRound,
			previousInitiative: previousCombatant?.initiative ?? null,
			nextInitiative: nextCombatant.initiative,
			wrapped,
			autoOnly: true,
		}),
	});
}
export function spendLegendaryAction(
	state: SessionBoardCombatState,
	trackerCombatantId: string,
	actionId: string,
): SessionBoardCombatState {
	const nextTrackers = state.legendaryTrackers.map((tracker) => {
		if (tracker.combatantId !== trackerCombatantId) return tracker;
		const action = tracker.actions.find((entry) => entry.id === actionId);
		if (!action || tracker.chargesRemaining < action.cost) return tracker;
		return {
			...tracker,
			chargesRemaining: tracker.chargesRemaining - action.cost,
			actions: tracker.actions.map((entry) =>
				entry.id !== actionId ? entry : { ...entry, usedCount: entry.usedCount + 1 },
			),
		};
	});
	return normalizeCombatState({
		...state,
		legendaryTrackers: nextTrackers,
	});
}

export function triggerLairActions(
	state: SessionBoardCombatState,
	options?: { autoOnly?: boolean },
): SessionBoardCombatState {
	const next = triggerLairTracker(state.lairTracker, {
		round: state.round,
		previousInitiative: null,
		nextInitiative:
			state.combatants.find((entry) => entry.id === state.activeCombatantId)?.initiative ?? null,
		wrapped: true,
		autoOnly: options?.autoOnly ?? false,
	});
	return normalizeCombatState({
		...state,
		lairTracker: next,
	});
}

export function recordCombatNotableRoll(
	state: SessionBoardCombatState,
	input: {
		kind: EncounterNotableRollKind;
		combatantName: string;
		combatantId?: string;
		round?: number;
		note?: string;
		recordedAt?: string;
	},
): SessionBoardCombatState {
	const kind = normalizeNotableRollKind(input.kind);
	if (!kind) return state;
	const combatantName = normalizeText(input.combatantName, MAX_NAME_LENGTH);
	if (!combatantName) return state;
	const roll: SessionBoardCombatNotableRoll = {
		id: `notable-roll-${Date.now()}-${state.notableRolls.length + 1}`,
		kind,
		combatantName,
		combatantId: normalizeText(input.combatantId, 80) || undefined,
		round: clampInt(input.round ?? state.round, 1, 999),
		note: normalizeText(input.note, 220) || undefined,
		recordedAt: normalizeText(input.recordedAt, 120) || nowISO(),
	};
	return normalizeCombatState({
		...state,
		notableRolls: [...state.notableRolls, roll].slice(-MAX_NOTABLE_ROLLS),
	});
}

export function conditionCatalogForSystem(systemId: string): readonly string[] {
	return systemId === 'dnd5e' ? DND5E_CONDITIONS : GENERIC_CONDITIONS;
}

export interface EncounterSummary {
	fell: SessionBoardCombatant[];
	fled: SessionBoardCombatant[];
	totalDamageDealt: number;
	participantObjectIds: VaultObjectId[];
	roundCount: number;
}

export function summarizeEncounter(state: SessionBoardCombatState): EncounterSummary {
	const fell = state.combatants.filter(
		(combatant) =>
			combatant.outcome === 'fell' ||
			(combatant.currentHp !== null && combatant.currentHp <= 0 && combatant.outcome !== 'fled'),
	);
	const fled = state.combatants.filter((combatant) => combatant.outcome === 'fled');
	const totalDamageDealt = state.combatants.reduce(
		(total, combatant) => total + combatant.damageDealt,
		0,
	);
	const participantObjectIds = [
		...new Set(state.combatants.map((combatant) => combatant.linkedObjectId).filter(Boolean)),
	] as VaultObjectId[];
	return {
		fell,
		fled,
		totalDamageDealt,
		participantObjectIds,
		roundCount: Math.max(1, state.round),
	};
}

function formatCombatantLink(combatant: SessionBoardCombatant): string {
	if (combatant.linkedObjectName) {
		return `[[${combatant.linkedObjectName}]]`;
	}
	return combatant.name;
}

function hpDeltaLabel(combatant: SessionBoardCombatant): string {
	if (combatant.startingHp == null || combatant.currentHp === null) return 'HP delta n/a';
	const delta = combatant.currentHp - combatant.startingHp;
	const signed = delta >= 0 ? `+${delta}` : String(delta);
	return `HP ${combatant.startingHp} -> ${combatant.currentHp} (delta ${signed})`;
}
export interface EncounterRewardSummary {
	treasureTier: 1 | 2 | 3;
	treasureTableName: string;
	totalBaseXp: number;
	xpAwards: EncounterXpAward[];
}

export function buildEncounterRewardSummary(
	state: SessionBoardCombatState,
): EncounterRewardSummary {
	const enemyEntries = state.combatants
		.filter((combatant) => !combatant.isPlayerCharacter)
		.map((combatant, index) => {
			const challengeRating = combatant.statsPreview?.challengeRating ?? '';
			const parsed = parseChallengeRating(challengeRating);
			return {
				id: `enemy-${index + 1}-${combatant.id}`,
				name: combatant.name,
				count: 1,
				challengeRating: parsed?.normalized ?? challengeRating,
				xpPerCreature: parsed?.xp ?? 0,
				legendaryActions: [],
				lairActions: [],
			};
		});
	const totalBaseXp = enemyEntries.reduce(
		(total, entry) => total + entry.count * entry.xpPerCreature,
		0,
	);
	const partyMembers = state.combatants
		.filter((combatant) => combatant.isPlayerCharacter)
		.map((combatant, index) => ({
			id: `participant-${index + 1}-${combatant.id}`,
			name: combatant.name,
			level: clampInt(combatant.statsPreview?.level ?? 1, 1, 20),
			linkedObjectId:
				combatant.linkedObjectType === 'character' ? combatant.linkedObjectId : undefined,
		}));
	const treasureTier = estimateEncounterTreasureTier(enemyEntries);
	return {
		treasureTier,
		treasureTableName: getTreasureTableNameForTier(treasureTier),
		totalBaseXp,
		xpAwards: buildXpAwards(partyMembers, totalBaseXp),
	};
}

export interface EncounterTreasureRoll {
	tableName: string;
	result: string;
	tier: 1 | 2 | 3;
}

export interface EncounterLogDraft {
	title: string;
	content: string;
	folder: string;
	tags: string[];
	participantObjectIds: VaultObjectId[];
}

export interface BuildEncounterLogDraftOptions {
	now?: Date;
	timelineEventId?: string | null;
	timelineEventTitle?: string | null;
	treasureRoll?: EncounterTreasureRoll | null;
	xpAwards?: EncounterXpAward[];
}

export function buildEncounterLogDraft(
	state: SessionBoardCombatState,
	options?: BuildEncounterLogDraftOptions,
): EncounterLogDraft {
	const now = options?.now ?? new Date();
	const iso = now.toISOString();
	const summary = summarizeEncounter(state);
	const rewards = buildEncounterRewardSummary(state);
	const xpAwards = options?.xpAwards ?? rewards.xpAwards;
	const encounterName = state.encounterName.trim() || 'Untitled Encounter';
	const derivedOutcome = [
		summary.fell.length > 0 ? `${summary.fell.length} fell` : 'none fell',
		summary.fled.length > 0 ? `${summary.fled.length} fled` : 'none fled',
		`${summary.totalDamageDealt} total damage dealt`,
	].join(', ');
	const outcomeText = state.outcome.trim() || derivedOutcome;
	const timelineLine = options?.timelineEventId
		? options.timelineEventTitle
			? `- Timeline Event: [[${options.timelineEventTitle}]] (${options.timelineEventId})`
			: `- Timeline Event ID: ${options.timelineEventId}`
		: '- Timeline Event: Not linked';
	const notableRollLines =
		state.notableRolls.length === 0
			? ['- None recorded.']
			: state.notableRolls.map((roll) => {
					const label =
						roll.kind === 'critical_hit'
							? 'Critical Hit'
							: roll.kind === 'critical_failure'
								? 'Critical Failure'
								: roll.kind === 'death_save_success'
									? 'Death Save Success'
									: 'Death Save Failure';
					const notePart = roll.note ? ` (${roll.note})` : '';
					return `- Round ${roll.round}: ${label} - ${roll.combatantName}${notePart}`;
				});
	const mapState = state.mapState;
	const mapHistoryLines =
		mapState.history.length === 0
			? ['- No combat-map events recorded.']
			: mapState.history
					.slice(-10)
					.map((entry) => `- ${entry.at}: [${entry.kind}] ${entry.message}`);

	const content = [
		`# ${encounterName}`,
		'',
		'## Encounter Metadata',
		`- Logged: ${iso}`,
		`- Rounds elapsed: ${summary.roundCount}`,
		`- Outcome: ${outcomeText}`,
		timelineLine,
		'',
		'## Combatants',
		...state.combatants.map((combatant) => {
			const initiativeLabel =
				combatant.initiative === null
					? 'No initiative'
					: `${combatant.initiative} (mod ${combatant.initiativeModifier >= 0 ? '+' : ''}${combatant.initiativeModifier})`;
			const conditionLabel =
				combatant.conditions.length > 0 ? combatant.conditions.join(', ') : 'None';
			const outcome = combatant.outcome === 'active' ? 'active' : combatant.outcome;
			return `- ${formatCombatantLink(combatant)} | Init ${initiativeLabel} | ${hpDeltaLabel(combatant)} | Conditions: ${conditionLabel} | Outcome: ${outcome}`;
		}),
		'',
		'## Notable Rolls',
		...notableRollLines,
		'',
		'## Outcome Summary',
		`- Fell: ${summary.fell.length > 0 ? summary.fell.map((combatant) => formatCombatantLink(combatant)).join(', ') : 'None'}`,
		`- Fled: ${summary.fled.length > 0 ? summary.fled.map((combatant) => formatCombatantLink(combatant)).join(', ') : 'None'}`,
		`- Total Damage Dealt: ${summary.totalDamageDealt}`,
		'',
		'## Combat Map Archive',
		`- Active Map ID: ${mapState.mapId ?? 'none'}`,
		`- Token Placements: ${mapState.tokens.length}`,
		`- AoE Templates: ${mapState.templates.length}`,
		`- Difficult Terrain Cells: ${mapState.difficultTerrain.length}`,
		`- Fog State Polygons: ${mapState.fogState?.revealedPolygons.length ?? 0}`,
		'',
		'### Combat Map History',
		...mapHistoryLines,
		'',
		'## Rewards',
		options?.treasureRoll
			? `- Treasure (${options.treasureRoll.tableName}, tier ${options.treasureRoll.tier}): ${options.treasureRoll.result}`
			: `- Treasure table: ${rewards.treasureTableName} (tier ${rewards.treasureTier})`,
		...(xpAwards.length === 0
			? ['- XP awards: None (no party members or no awarded XP).']
			: xpAwards.map((award) => {
					const link = award.linkedObjectId ? ` [[${award.name}]]` : ` ${award.name}`;
					return `- XP${link}: ${award.xp.toLocaleString()}`;
				})),
		'',
		'## Loot Rolled',
		state.loot.trim() || '- None recorded.',
		'',
		'## Encounter Notes',
		state.notes.trim() || '- No additional notes.',
	].join('\n');

	const safeDate = iso.slice(0, 10);
	const tags = ['session', 'combat', 'encounter-log'];
	if (options?.timelineEventId) tags.push('timeline-linked');
	return {
		title: `Encounter Log - ${encounterName} (${safeDate})`,
		content,
		folder: '/sessions/encounters',
		tags,
		participantObjectIds: summary.participantObjectIds,
	};
}
