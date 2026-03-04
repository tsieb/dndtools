import { nowISO } from '$lib/utils/date.js';
import type { Note } from '$lib/types/note.js';
import type { StatBlockObject, VaultObject, VaultObjectId } from '$lib/types/object.js';
import type {
	EncounterDifficulty,
	EncounterEnvironmentType,
	SessionBoardEncounterBudget,
	SessionBoardEncounterChecklistItem,
	SessionBoardEncounterCombatantEntry,
	SessionBoardEncounterLairAction,
	SessionBoardEncounterLairTracker,
	SessionBoardEncounterLegendaryAction,
	SessionBoardEncounterLegendaryTracker,
	SessionBoardEncounterNotableRoll,
	SessionBoardEncounterPartyMember,
	SessionBoardEncounterState,
} from '$lib/types/session-board.js';

export interface ParsedChallengeRating {
	normalized: string;
	numeric: number;
	xp: number;
}

export interface EncounterEnvironmentProfile {
	type: EncounterEnvironmentType;
	label: string;
	modifiers: {
		difficultTerrain: boolean;
		visibility: 'clear' | 'limited' | 'obscured';
		lairActionsAvailable: boolean;
	};
	tacticalChecklist: string[];
}

export interface EncounterXpAward {
	name: string;
	linkedObjectId?: VaultObjectId;
	xp: number;
}

const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 4_000;
const MAX_OUTCOME_LENGTH = 600;
const MAX_TRACKED_ENTRIES = 80;

const CHALLENGE_RATING_XP: Record<string, number> = {
	'0': 10,
	'1/8': 25,
	'1/4': 50,
	'1/2': 100,
	'1': 200,
	'2': 450,
	'3': 700,
	'4': 1_100,
	'5': 1_800,
	'6': 2_300,
	'7': 2_900,
	'8': 3_900,
	'9': 5_000,
	'10': 5_900,
	'11': 7_200,
	'12': 8_400,
	'13': 10_000,
	'14': 11_500,
	'15': 13_000,
	'16': 15_000,
	'17': 18_000,
	'18': 20_000,
	'19': 22_000,
	'20': 25_000,
	'21': 33_000,
	'22': 41_000,
	'23': 50_000,
	'24': 62_000,
	'25': 75_000,
	'26': 90_000,
	'27': 105_000,
	'28': 120_000,
	'29': 135_000,
	'30': 155_000,
};

const LEVEL_THRESHOLDS: Record<
	number,
	Omit<SessionBoardEncounterBudget, 'baseXp' | 'adjustedXp' | 'multiplier' | 'difficulty'>
> = {
	1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
	2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
	3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
	4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
	5: { easy: 250, medium: 500, hard: 750, deadly: 1_100 },
	6: { easy: 300, medium: 600, hard: 900, deadly: 1_400 },
	7: { easy: 350, medium: 750, hard: 1_100, deadly: 1_700 },
	8: { easy: 450, medium: 900, hard: 1_400, deadly: 2_100 },
	9: { easy: 550, medium: 1_100, hard: 1_600, deadly: 2_400 },
	10: { easy: 600, medium: 1_200, hard: 1_900, deadly: 2_800 },
	11: { easy: 800, medium: 1_600, hard: 2_400, deadly: 3_600 },
	12: { easy: 1_000, medium: 2_000, hard: 3_000, deadly: 4_500 },
	13: { easy: 1_100, medium: 2_200, hard: 3_400, deadly: 5_100 },
	14: { easy: 1_250, medium: 2_500, hard: 3_800, deadly: 5_700 },
	15: { easy: 1_400, medium: 2_800, hard: 4_300, deadly: 6_400 },
	16: { easy: 1_600, medium: 3_200, hard: 4_800, deadly: 7_200 },
	17: { easy: 2_000, medium: 3_900, hard: 5_900, deadly: 8_800 },
	18: { easy: 2_100, medium: 4_200, hard: 6_300, deadly: 9_500 },
	19: { easy: 2_400, medium: 4_900, hard: 7_300, deadly: 10_900 },
	20: { easy: 2_800, medium: 5_700, hard: 8_500, deadly: 12_700 },
};

const ENVIRONMENT_PROFILES: Record<EncounterEnvironmentType, EncounterEnvironmentProfile> = {
	forest: {
		type: 'forest',
		label: 'Forest',
		modifiers: {
			difficultTerrain: true,
			visibility: 'limited',
			lairActionsAvailable: false,
		},
		tacticalChecklist: [
			'Mark heavy undergrowth as difficult terrain lanes.',
			'Define sightline breaks from trunks, roots, and canopy.',
			'Pre-plan vertical positions (branches, ridgelines, ambush spots).',
		],
	},
	dungeon: {
		type: 'dungeon',
		label: 'Dungeon',
		modifiers: {
			difficultTerrain: true,
			visibility: 'limited',
			lairActionsAvailable: true,
		},
		tacticalChecklist: [
			'Identify choke points, doors, and hard cover before round one.',
			'Track light-source range and darkvision constraints.',
			'Reserve one hazard trigger (collapse, trap, gas, reinforcements).',
		],
	},
	urban: {
		type: 'urban',
		label: 'Urban',
		modifiers: {
			difficultTerrain: false,
			visibility: 'limited',
			lairActionsAvailable: false,
		},
		tacticalChecklist: [
			'Define crowd and bystander zones to avoid collateral confusion.',
			'Tag roofs, alleys, and windows as mobility vectors.',
			'List guard or faction response triggers if combat escalates.',
		],
	},
	water: {
		type: 'water',
		label: 'Water',
		modifiers: {
			difficultTerrain: true,
			visibility: 'obscured',
			lairActionsAvailable: true,
		},
		tacticalChecklist: [
			'Apply swim-speed penalties and ranged attack limitations.',
			'Track breath/air pressure constraints for submerged actors.',
			'Identify current flow direction and forced-movement hazards.',
		],
	},
	aerial: {
		type: 'aerial',
		label: 'Aerial',
		modifiers: {
			difficultTerrain: false,
			visibility: 'clear',
			lairActionsAvailable: false,
		},
		tacticalChecklist: [
			'Set altitude bands and falling damage adjudication rules.',
			'Clarify forced-movement and knock-prone resolution while flying.',
			'Mark hard landing zones and no-hover hazard zones.',
		],
	},
};

const COMBATANT_MULTIPLIERS = [
	{ min: 1, max: 1, value: 1 },
	{ min: 2, max: 2, value: 1.5 },
	{ min: 3, max: 6, value: 2 },
	{ min: 7, max: 10, value: 2.5 },
	{ min: 11, max: 14, value: 3 },
	{ min: 15, max: Number.POSITIVE_INFINITY, value: 4 },
] as const;

const MULTIPLIER_STEPS = [1, 1.5, 2, 2.5, 3, 4] as const;
const ENVIRONMENT_KEYS = ['environmentType', 'environment', 'terrain', 'mapEnvironment'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function normalizeText(value: unknown, maxLength: number): string {
	return asString(value).trim().slice(0, maxLength);
}

function clampInt(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeDifficulty(value: unknown): EncounterDifficulty {
	return value === 'easy' ||
		value === 'medium' ||
		value === 'hard' ||
		value === 'deadly' ||
		value === 'overwhelming'
		? value
		: 'trivial';
}

function normalizeEncounterEnvironment(value: unknown): EncounterEnvironmentType | null {
	if (
		value === 'forest' ||
		value === 'dungeon' ||
		value === 'urban' ||
		value === 'water' ||
		value === 'aerial'
	) {
		return value;
	}
	return null;
}

function normalizeChallengeRatingToken(raw: string): string {
	let cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/^cr\s*/i, '');
	if (!cleaned) return '';
	const token = cleaned.split(/[ ,;()]/)[0] ?? '';
	cleaned = token.trim();
	if (!cleaned) return '';
	if (cleaned === '⅛') return '1/8';
	if (cleaned === '¼') return '1/4';
	if (cleaned === '½') return '1/2';
	return cleaned;
}

function challengeRatingNumericFromToken(token: string): number | null {
	if (!token) return null;
	const fractionMatch = token.match(/^(\d+)\s*\/\s*(\d+)$/);
	if (fractionMatch) {
		const numerator = Number.parseInt(fractionMatch[1] ?? '', 10);
		const denominator = Number.parseInt(fractionMatch[2] ?? '', 10);
		if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0)
			return null;
		return numerator / denominator;
	}
	const parsed = Number.parseFloat(token);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed;
}

function challengeRatingKeyFromNumeric(value: number): string | null {
	if (!Number.isFinite(value) || value < 0) return null;
	if (value === 0) return '0';
	if (Math.abs(value - 0.125) < 0.0001) return '1/8';
	if (Math.abs(value - 0.25) < 0.0001) return '1/4';
	if (Math.abs(value - 0.5) < 0.0001) return '1/2';
	if (Number.isInteger(value) && value >= 1 && value <= 30) return String(value);
	return null;
}

function normalizeLegendaryAction(
	value: unknown,
	index: number,
): SessionBoardEncounterLegendaryAction | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, 120);
	if (!name) return null;
	const parsedCost =
		typeof value.cost === 'number' && Number.isFinite(value.cost)
			? Math.trunc(value.cost)
			: (parseLegendaryActionCost(name, asString(value.description)) ?? 1);
	return {
		id: normalizeText(value.id, 64) || `legendary-${index + 1}`,
		name,
		cost: clampInt(parsedCost, 1, 5),
		description: normalizeText(value.description, 600) || undefined,
		usedCount: clampInt(Number(value.usedCount) || 0, 0, 9_999),
	};
}

function normalizeLairAction(
	value: unknown,
	index: number,
): SessionBoardEncounterLairAction | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, 120);
	if (!name) return null;
	return {
		id: normalizeText(value.id, 64) || `lair-${index + 1}`,
		name,
		description: normalizeText(value.description, 600) || undefined,
		autoTrigger: value.autoTrigger === true,
		usedCount: clampInt(Number(value.usedCount) || 0, 0, 9_999),
	};
}

function normalizeChecklistItem(
	value: unknown,
	index: number,
): SessionBoardEncounterChecklistItem | null {
	if (!isRecord(value)) return null;
	const label = normalizeText(value.label, 220);
	if (!label) return null;
	return {
		id: normalizeText(value.id, 64) || `check-${index + 1}`,
		label,
		checked: value.checked === true,
	};
}

function normalizeNotableRoll(
	value: unknown,
	index: number,
): SessionBoardEncounterNotableRoll | null {
	if (!isRecord(value)) return null;
	const combatantName = normalizeText(value.combatantName, MAX_NAME_LENGTH);
	if (!combatantName) return null;
	const kind =
		value.kind === 'critical_hit' ||
		value.kind === 'critical_failure' ||
		value.kind === 'death_save_success' ||
		value.kind === 'death_save_failure'
			? value.kind
			: null;
	if (!kind) return null;
	return {
		id: normalizeText(value.id, 64) || `roll-${index + 1}`,
		kind,
		combatantName,
		combatantEntryId: normalizeText(value.combatantEntryId, 64) || undefined,
		round: clampInt(Number(value.round) || 1, 1, 999),
		note: normalizeText(value.note, 220) || undefined,
		recordedAt: normalizeText(value.recordedAt, 120) || nowISO(),
	};
}

function normalizePartyMember(
	value: unknown,
	index: number,
): SessionBoardEncounterPartyMember | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, MAX_NAME_LENGTH);
	if (!name) return null;
	return {
		id: normalizeText(value.id, 64) || `party-${index + 1}`,
		name,
		level: clampInt(Number(value.level) || 1, 1, 20),
		linkedObjectId: normalizeText(value.linkedObjectId, 120) as VaultObjectId | undefined,
	};
}

function normalizeCombatantEntry(
	value: unknown,
	index: number,
): SessionBoardEncounterCombatantEntry | null {
	if (!isRecord(value)) return null;
	const name = normalizeText(value.name, MAX_NAME_LENGTH);
	if (!name) return null;
	const challengeRating = normalizeText(value.challengeRating, 16);
	const xpPerCreatureRaw =
		typeof value.xpPerCreature === 'number' && Number.isFinite(value.xpPerCreature)
			? Math.max(0, Math.round(value.xpPerCreature))
			: (parseChallengeRating(challengeRating)?.xp ?? 0);
	const legendaryActionsRaw = Array.isArray(value.legendaryActions) ? value.legendaryActions : [];
	const lairActionsRaw = Array.isArray(value.lairActions) ? value.lairActions : [];
	return {
		id: normalizeText(value.id, 64) || `entry-${index + 1}`,
		name,
		count: clampInt(Number(value.count) || 1, 1, 99),
		challengeRating,
		xpPerCreature: clampInt(xpPerCreatureRaw, 0, 500_000),
		statBlockObjectId: normalizeText(value.statBlockObjectId, 120) as VaultObjectId | undefined,
		legendaryActions: legendaryActionsRaw
			.map((entry, i) => normalizeLegendaryAction(entry, i))
			.filter((entry): entry is SessionBoardEncounterLegendaryAction => !!entry)
			.slice(0, 24),
		lairActions: lairActionsRaw
			.map((entry, i) => normalizeLairAction(entry, i))
			.filter((entry): entry is SessionBoardEncounterLairAction => !!entry)
			.slice(0, 24),
	};
}

function normalizeBudget(value: unknown): SessionBoardEncounterBudget {
	if (!isRecord(value)) {
		return {
			easy: 0,
			medium: 0,
			hard: 0,
			deadly: 0,
			baseXp: 0,
			adjustedXp: 0,
			multiplier: 1,
			difficulty: 'trivial',
		};
	}
	return {
		easy: clampInt(Number(value.easy) || 0, 0, 1_000_000_000),
		medium: clampInt(Number(value.medium) || 0, 0, 1_000_000_000),
		hard: clampInt(Number(value.hard) || 0, 0, 1_000_000_000),
		deadly: clampInt(Number(value.deadly) || 0, 0, 1_000_000_000),
		baseXp: clampInt(Number(value.baseXp) || 0, 0, 1_000_000_000),
		adjustedXp: clampInt(Number(value.adjustedXp) || 0, 0, 1_000_000_000),
		multiplier:
			typeof value.multiplier === 'number' && Number.isFinite(value.multiplier)
				? Math.max(1, Math.min(8, value.multiplier))
				: 1,
		difficulty: normalizeDifficulty(value.difficulty),
	};
}

function flattenLines(input: string): string[] {
	return input
		.split(/\r?\n|;/g)
		.map((line) => line.replace(/^[*\-\d.)\s]+/, '').trim())
		.filter(Boolean);
}

function extractStringFromPath(record: Record<string, unknown>, path: string[]): string | null {
	let cursor: unknown = record;
	for (const key of path) {
		if (!isRecord(cursor)) return null;
		cursor = cursor[key];
	}
	const value = normalizeText(cursor, 120);
	return value || null;
}

export function parseChallengeRating(
	value: string | undefined | null,
): ParsedChallengeRating | null {
	const token = normalizeChallengeRatingToken(value ?? '');
	if (!token) return null;
	const numeric = challengeRatingNumericFromToken(token);
	if (numeric === null) return null;
	const key = challengeRatingKeyFromNumeric(numeric);
	if (!key) return null;
	const xp = CHALLENGE_RATING_XP[key];
	if (!xp) return null;
	return {
		normalized: key,
		numeric,
		xp,
	};
}

export function xpForChallengeRating(value: string | undefined | null): number {
	return parseChallengeRating(value)?.xp ?? 0;
}

export function parseLegendaryActionCost(
	name: string,
	description?: string | undefined,
): number | null {
	const composite = `${name} ${description ?? ''}`;
	const match = composite.match(/costs?\s*(\d+)\s*actions?/i);
	if (!match) return null;
	const parsed = Number.parseInt(match[1] ?? '', 10);
	if (!Number.isFinite(parsed)) return null;
	return clampInt(parsed, 1, 5);
}

export function buildLegendaryActionsFromStatBlock(
	statBlock: StatBlockObject,
): SessionBoardEncounterLegendaryAction[] {
	return statBlock.data.legendaryActions
		.map<SessionBoardEncounterLegendaryAction | null>((entry, index) => {
			const name = normalizeText(entry.name, 120);
			if (!name) return null;
			const cost = parseLegendaryActionCost(entry.name, entry.description) ?? 1;
			const description = normalizeText(entry.description, 600) || undefined;
			return {
				id: `${String(statBlock.id)}-legendary-${index + 1}`,
				name,
				cost,
				description,
				usedCount: 0,
			};
		})
		.filter((entry): entry is SessionBoardEncounterLegendaryAction => !!entry)
		.slice(0, 24);
}

export function buildLairActionsFromStatBlock(
	statBlock: StatBlockObject,
): SessionBoardEncounterLairAction[] {
	const candidates: string[] = [];
	for (const trait of statBlock.data.traits) {
		if (!/lair/i.test(trait.name) && !/lair action/i.test(trait.description)) continue;
		candidates.push(...flattenLines(trait.description));
	}
	for (const action of statBlock.data.actions) {
		if (!/lair/i.test(action.name)) continue;
		candidates.push(normalizeText(action.name, 120));
	}

	const unique = [...new Set(candidates.map((entry) => normalizeText(entry, 120)).filter(Boolean))];
	return unique.slice(0, 24).map((name, index) => ({
		id: `${String(statBlock.id)}-lair-${index + 1}`,
		name,
		autoTrigger: index === 0,
		usedCount: 0,
	}));
}

export function encounterMultiplierForCount(creatureCount: number, partySize: number): number {
	if (!Number.isFinite(creatureCount) || creatureCount <= 0) return 1;
	const base =
		COMBATANT_MULTIPLIERS.find((entry) => creatureCount >= entry.min && creatureCount <= entry.max)
			?.value ?? 1;
	let index = MULTIPLIER_STEPS.findIndex((entry) => entry === base);
	if (index < 0) index = 0;
	if (partySize > 0 && partySize < 3) index += 1;
	else if (partySize > 5) index -= 1;
	index = clampInt(index, 0, MULTIPLIER_STEPS.length - 1);
	return MULTIPLIER_STEPS[index] ?? 1;
}

export function buildPartyThresholds(
	partyMembers: readonly SessionBoardEncounterPartyMember[],
): Pick<SessionBoardEncounterBudget, 'easy' | 'medium' | 'hard' | 'deadly'> {
	const fallbackThresholds = LEVEL_THRESHOLDS[1] ?? { easy: 25, medium: 50, hard: 75, deadly: 100 };
	return partyMembers.reduce(
		(acc, member) => {
			const level = clampInt(member.level, 1, 20);
			const thresholds = LEVEL_THRESHOLDS[level] ?? fallbackThresholds;
			acc.easy += thresholds.easy;
			acc.medium += thresholds.medium;
			acc.hard += thresholds.hard;
			acc.deadly += thresholds.deadly;
			return acc;
		},
		{ easy: 0, medium: 0, hard: 0, deadly: 0 },
	);
}

export function classifyEncounterDifficulty(
	adjustedXp: number,
	thresholds: Pick<SessionBoardEncounterBudget, 'easy' | 'medium' | 'hard' | 'deadly'>,
): EncounterDifficulty {
	if (adjustedXp <= 0) return 'trivial';
	if (thresholds.easy <= 0) return 'trivial';
	if (adjustedXp < thresholds.easy) return 'trivial';
	if (adjustedXp < thresholds.medium) return 'easy';
	if (adjustedXp < thresholds.hard) return 'medium';
	if (adjustedXp < thresholds.deadly) return 'hard';
	if (adjustedXp <= thresholds.deadly * 1.5) return 'deadly';
	return 'overwhelming';
}

export function calculateEncounterBudget(
	partyMembers: readonly SessionBoardEncounterPartyMember[],
	combatants: readonly SessionBoardEncounterCombatantEntry[],
): SessionBoardEncounterBudget {
	const thresholds = buildPartyThresholds(partyMembers);
	const creatureCount = combatants.reduce((total, entry) => total + Math.max(0, entry.count), 0);
	const baseXp = combatants.reduce(
		(total, entry) => total + Math.max(0, entry.count) * Math.max(0, entry.xpPerCreature),
		0,
	);
	const multiplier = encounterMultiplierForCount(creatureCount, partyMembers.length);
	const adjustedXp = Math.round(baseXp * multiplier);
	return {
		...thresholds,
		baseXp,
		adjustedXp,
		multiplier,
		difficulty: classifyEncounterDifficulty(adjustedXp, thresholds),
	};
}

export function getEnvironmentProfile(
	environmentType: EncounterEnvironmentType | null,
): EncounterEnvironmentProfile | null {
	if (!environmentType) return null;
	return ENVIRONMENT_PROFILES[environmentType] ?? null;
}

export function buildEnvironmentChecklist(
	environmentType: EncounterEnvironmentType | null,
	options?: { includeLairHint?: boolean },
): SessionBoardEncounterChecklistItem[] {
	const profile = getEnvironmentProfile(environmentType);
	if (!profile) return [];
	const base = [...profile.tacticalChecklist];
	if (options?.includeLairHint && profile.modifiers.lairActionsAvailable) {
		base.push('Confirm lair action trigger at initiative count 20.');
	}
	return base.slice(0, 12).map((label, index) => ({
		id: `env-check-${index + 1}`,
		label,
		checked: false,
	}));
}

export function inferEnvironmentTypeFromNote(
	note: Pick<Note, 'tags' | 'frontmatter'>,
): EncounterEnvironmentType | null {
	const frontmatter = isRecord(note.frontmatter) ? note.frontmatter : {};
	for (const key of ENVIRONMENT_KEYS) {
		const candidate = normalizeEncounterEnvironment(
			normalizeText(frontmatter[key], 30).toLowerCase(),
		);
		if (candidate) return candidate;
	}
	const nestedCandidates = [
		extractStringFromPath(frontmatter, ['map', 'environmentType']),
		extractStringFromPath(frontmatter, ['map', 'environment']),
		extractStringFromPath(frontmatter, ['map', 'terrain']),
		extractStringFromPath(frontmatter, ['dndtools', 'map', 'environmentType']),
		extractStringFromPath(frontmatter, ['dndtools', 'object', 'data', 'locationType']),
	];
	for (const value of nestedCandidates) {
		const candidate = normalizeEncounterEnvironment(value?.toLowerCase() ?? null);
		if (candidate) return candidate;
	}

	const tags = note.tags.map((tag) => tag.toLowerCase().trim());
	if (tags.some((tag) => tag.includes('dungeon'))) return 'dungeon';
	if (tags.some((tag) => tag.includes('forest') || tag.includes('wilderness'))) return 'forest';
	if (tags.some((tag) => tag.includes('urban') || tag.includes('city'))) return 'urban';
	if (tags.some((tag) => tag.includes('water') || tag.includes('coast') || tag.includes('sea')))
		return 'water';
	if (tags.some((tag) => tag.includes('aerial') || tag.includes('sky'))) return 'aerial';
	return null;
}

export function getEncounterDifficultyMeterPercent(budget: SessionBoardEncounterBudget): number {
	if (budget.deadly <= 0) return 0;
	return Math.max(0, Math.min(100, Math.round((budget.adjustedXp / budget.deadly) * 100)));
}

export function estimateEncounterTreasureTier(
	combatants: readonly SessionBoardEncounterCombatantEntry[],
): 1 | 2 | 3 {
	let maxCr = 0;
	for (const combatant of combatants) {
		const parsed = parseChallengeRating(combatant.challengeRating);
		if (!parsed) continue;
		if (parsed.numeric > maxCr) maxCr = parsed.numeric;
	}
	if (maxCr >= 11) return 3;
	if (maxCr >= 5) return 2;
	return 1;
}

export function getTreasureTableNameForTier(tier: 1 | 2 | 3): string {
	if (tier === 1) return '5e Treasure Hoard Tier 1';
	if (tier === 2) return '5e Treasure Hoard Tier 2';
	return '5e Treasure Hoard Tier 3';
}

export function buildXpAwards(
	partyMembers: readonly SessionBoardEncounterPartyMember[],
	totalBaseXp: number,
): EncounterXpAward[] {
	if (partyMembers.length === 0 || totalBaseXp <= 0) return [];
	const perMember = Math.floor(totalBaseXp / partyMembers.length);
	return partyMembers.map((member) => ({
		name: member.name,
		linkedObjectId: member.linkedObjectId,
		xp: perMember,
	}));
}

export function createDefaultEncounterState(now = nowISO()): SessionBoardEncounterState {
	return {
		encounterName: '',
		partyMembers: [],
		combatants: [],
		environmentType: null,
		environmentNoteId: null,
		environmentName: '',
		tacticalChecklist: [],
		budget: {
			easy: 0,
			medium: 0,
			hard: 0,
			deadly: 0,
			baseXp: 0,
			adjustedXp: 0,
			multiplier: 1,
			difficulty: 'trivial',
		},
		round: 1,
		activeCombatantEntryId: null,
		legendaryTrackers: [],
		lairTracker: {
			enabled: false,
			initiativeCount: 20,
			lastTriggeredRound: null,
			actions: [],
		},
		notableRolls: [],
		notes: '',
		outcome: '',
		startedAt: now,
		endedAt: null,
		lastLogNoteId: null,
	};
}

export function normalizeEncounterState(value: unknown): SessionBoardEncounterState {
	if (!isRecord(value)) return createDefaultEncounterState();
	const partyMembers = (Array.isArray(value.partyMembers) ? value.partyMembers : [])
		.map((entry, index) => normalizePartyMember(entry, index))
		.filter((entry): entry is SessionBoardEncounterPartyMember => !!entry)
		.slice(0, MAX_TRACKED_ENTRIES);
	const combatants = (Array.isArray(value.combatants) ? value.combatants : [])
		.map((entry, index) => normalizeCombatantEntry(entry, index))
		.filter((entry): entry is SessionBoardEncounterCombatantEntry => !!entry)
		.slice(0, MAX_TRACKED_ENTRIES);
	const derivedBudget = calculateEncounterBudget(partyMembers, combatants);
	const sourceBudget = normalizeBudget(value.budget);
	const checklist = (Array.isArray(value.tacticalChecklist) ? value.tacticalChecklist : [])
		.map((entry, index) => normalizeChecklistItem(entry, index))
		.filter((entry): entry is SessionBoardEncounterChecklistItem => !!entry)
		.slice(0, 24);

	const notableRolls = (Array.isArray(value.notableRolls) ? value.notableRolls : [])
		.map((entry, index) => normalizeNotableRoll(entry, index))
		.filter((entry): entry is SessionBoardEncounterNotableRoll => !!entry)
		.slice(0, MAX_TRACKED_ENTRIES);
	const round = clampInt(Number(value.round) || 1, 1, 999);
	const activeCombatantEntryId = normalizeText(value.activeCombatantEntryId, 64);
	const hasActive = combatants.some((entry) => entry.id === activeCombatantEntryId);
	const legendaryTrackers = (Array.isArray(value.legendaryTrackers) ? value.legendaryTrackers : [])
		.filter(isRecord)
		.map((entry) => {
			const combatantEntryId = normalizeText(entry.combatantEntryId, 64);
			const actionsRaw = Array.isArray(entry.actions) ? entry.actions : [];
			const actions = actionsRaw
				.map((action, actionIndex) => normalizeLegendaryAction(action, actionIndex))
				.filter((action): action is SessionBoardEncounterLegendaryAction => !!action)
				.slice(0, 24);
			if (!combatantEntryId || actions.length === 0) return null;
			return {
				combatantEntryId,
				combatantName:
					normalizeText(entry.combatantName, MAX_NAME_LENGTH) ||
					combatants.find((item) => item.id === combatantEntryId)?.name ||
					'Legendary Creature',
				chargesMax: clampInt(Number(entry.chargesMax) || 3, 1, 9),
				chargesRemaining: clampInt(Number(entry.chargesRemaining) || 3, 0, 9),
				actions,
			};
		})
		.filter((entry): entry is SessionBoardEncounterLegendaryTracker => !!entry)
		.slice(0, 20);
	const lairActionsRaw =
		isRecord(value.lairTracker) && Array.isArray(value.lairTracker.actions)
			? value.lairTracker.actions
			: [];
	const lairActions = lairActionsRaw
		.map((entry, index) => normalizeLairAction(entry, index))
		.filter((entry): entry is SessionBoardEncounterLairAction => !!entry)
		.slice(0, 24);
	const lairTracker: SessionBoardEncounterLairTracker = {
		enabled: isRecord(value.lairTracker) && value.lairTracker.enabled === true,
		initiativeCount: clampInt(
			isRecord(value.lairTracker) ? Number(value.lairTracker.initiativeCount) || 20 : 20,
			1,
			30,
		),
		lastTriggeredRound: isRecord(value.lairTracker)
			? clampInt(Number(value.lairTracker.lastTriggeredRound) || 0, 0, 999) || null
			: null,
		actions: lairActions,
	};
	return {
		encounterName: normalizeText(value.encounterName, MAX_NAME_LENGTH),
		partyMembers,
		combatants,
		environmentType: normalizeEncounterEnvironment(value.environmentType),
		environmentNoteId: (normalizeText(value.environmentNoteId, 160) ||
			null) as SessionBoardEncounterState['environmentNoteId'],
		environmentName: normalizeText(value.environmentName, MAX_NAME_LENGTH),
		tacticalChecklist: checklist,
		budget: {
			easy: sourceBudget.easy || derivedBudget.easy,
			medium: sourceBudget.medium || derivedBudget.medium,
			hard: sourceBudget.hard || derivedBudget.hard,
			deadly: sourceBudget.deadly || derivedBudget.deadly,
			baseXp: derivedBudget.baseXp,
			adjustedXp: derivedBudget.adjustedXp,
			multiplier: derivedBudget.multiplier,
			difficulty: derivedBudget.difficulty,
		},
		round,
		activeCombatantEntryId: hasActive ? activeCombatantEntryId : null,
		legendaryTrackers,
		lairTracker,
		notableRolls,
		notes: normalizeText(value.notes, MAX_NOTES_LENGTH),
		outcome: normalizeText(value.outcome, MAX_OUTCOME_LENGTH),
		startedAt: normalizeText(value.startedAt, 120) || null,
		endedAt: normalizeText(value.endedAt, 120) || null,
		lastLogNoteId: (normalizeText(value.lastLogNoteId, 160) ||
			null) as SessionBoardEncounterState['lastLogNoteId'],
	};
}

export function buildEncounterStateFromCombatants(input: {
	encounterName: string;
	partyMembers: SessionBoardEncounterPartyMember[];
	combatants: SessionBoardEncounterCombatantEntry[];
	environmentType: EncounterEnvironmentType | null;
	now?: string;
}): SessionBoardEncounterState {
	const checklist = buildEnvironmentChecklist(input.environmentType, { includeLairHint: true });
	const budget = calculateEncounterBudget(input.partyMembers, input.combatants);
	return normalizeEncounterState({
		...createDefaultEncounterState(input.now ?? nowISO()),
		encounterName: input.encounterName,
		partyMembers: input.partyMembers,
		combatants: input.combatants,
		environmentType: input.environmentType,
		tacticalChecklist: checklist,
		budget,
	});
}

export function asStatBlockObject(value: VaultObject | null | undefined): StatBlockObject | null {
	if (!value || value.type !== 'stat_block') return null;
	return value;
}
