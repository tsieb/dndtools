import { nowISO } from '$lib/utils/date.js';
import type {
	CombatantOutcome,
	SessionBoardCombatState,
	SessionBoardCombatant,
	SessionBoardDeathSaves,
	SessionBoardLinkedStatsPreview,
} from '$lib/types/session-board.js';
import type { VaultObject, VaultObjectId } from '$lib/types/object.js';

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
const MAX_DAMAGE = 99_999;

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
	return {
		encounterName: normalizeText(value.encounterName, MAX_NAME_LENGTH),
		systemId: normalizeText(value.systemId, 40) || 'dnd5e',
		round,
		activeCombatantId,
		combatants,
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

export function advanceCombatTurn(state: SessionBoardCombatState): SessionBoardCombatState {
	const sorted = sortCombatantsForInitiative(state.combatants);
	if (sorted.length === 0) {
		return {
			...state,
			combatants: sorted,
			activeCombatantId: null,
		};
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
		return {
			...state,
			combatants: sorted,
		};
	}

	const nextCombatant = sorted[nextIndex];
	if (!nextCombatant) {
		return {
			...state,
			combatants: sorted,
		};
	}

	const nextCombatants = sorted.map((combatant) =>
		combatant.id !== nextCombatant.id || !(combatant.delayed && combatant.ready)
			? combatant
			: { ...combatant, delayed: false, ready: false },
	);

	return {
		...state,
		round: wrapped ? state.round + 1 : state.round,
		activeCombatantId: nextCombatant.id,
		combatants: nextCombatants,
	};
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
		...new Set(state.combatants.map((c) => c.linkedObjectId).filter(Boolean)),
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

export interface EncounterLogDraft {
	title: string;
	content: string;
	folder: string;
	tags: string[];
	participantObjectIds: VaultObjectId[];
}

export function buildEncounterLogDraft(
	state: SessionBoardCombatState,
	options?: { now?: Date },
): EncounterLogDraft {
	const now = options?.now ?? new Date();
	const iso = now.toISOString();
	const summary = summarizeEncounter(state);
	const encounterName = state.encounterName.trim() || 'Untitled Encounter';
	const outcomeLine = [
		summary.fell.length > 0 ? `${summary.fell.length} fell` : 'none fell',
		summary.fled.length > 0 ? `${summary.fled.length} fled` : 'none fled',
		`${summary.totalDamageDealt} total damage dealt`,
	].join(', ');

	const content = [
		`# ${encounterName}`,
		'',
		`- Logged: ${iso}`,
		`- Rounds: ${summary.roundCount}`,
		`- Outcome: ${outcomeLine}`,
		'',
		'## Combatants',
		...state.combatants.map((combatant) => {
			const initiativeLabel =
				combatant.initiative === null
					? 'No initiative'
					: `${combatant.initiative} (mod ${combatant.initiativeModifier >= 0 ? '+' : ''}${combatant.initiativeModifier})`;
			const hpLabel =
				combatant.currentHp === null || combatant.maxHp === null
					? 'HP n/a'
					: `${combatant.currentHp}/${combatant.maxHp}`;
			const conditionLabel =
				combatant.conditions.length > 0 ? combatant.conditions.join(', ') : 'None';
			const outcome = combatant.outcome === 'active' ? 'active' : combatant.outcome;
			return `- ${formatCombatantLink(combatant)} | Init ${initiativeLabel} | ${hpLabel} | Conditions: ${conditionLabel} | Outcome: ${outcome}`;
		}),
		'',
		'## Outcome Summary',
		`- Fell: ${summary.fell.length > 0 ? summary.fell.map((combatant) => formatCombatantLink(combatant)).join(', ') : 'None'}`,
		`- Fled: ${summary.fled.length > 0 ? summary.fled.map((combatant) => formatCombatantLink(combatant)).join(', ') : 'None'}`,
		`- Total Damage Dealt: ${summary.totalDamageDealt}`,
		'',
		'## Loot Rolled',
		state.loot.trim() || '- None recorded.',
		'',
		'## Encounter Notes',
		state.notes.trim() || '- No additional notes.',
	].join('\n');

	const safeDate = iso.slice(0, 10);
	return {
		title: `Encounter Log - ${encounterName} (${safeDate})`,
		content,
		folder: '/sessions/encounters',
		tags: ['session', 'combat', 'encounter-log'],
		participantObjectIds: summary.participantObjectIds,
	};
}
