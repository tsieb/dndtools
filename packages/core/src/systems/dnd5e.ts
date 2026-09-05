/**
 * RC-SYS-1.2 — the built-in D&D 5e reference `SystemPackage`.
 *
 * This is the shape of fifth edition expressed purely as data: six abilities, the fifteen
 * conditions, spell slots 1–9, hit dice, the class resources a character sheet has to track, the
 * experience table, the challenge-rating payout and the skill list. No behaviour, no functions —
 * every derivation is a formula string the pure `evaluateFormula` in `state/system-package.ts`
 * reads, so this package is exactly as privileged as one a DM authors by hand.
 *
 * It also carries the 5e REFERENCE TABLES that do not fit the package shape (challenge rating to
 * experience, hit die by class, the full-caster slot progression). They live here rather than
 * scattered through core so SYS-2 has one place to swap when a different system is active; the
 * tests in `packages/core/tests/systems-packages.test.ts` pin each one against the literal core
 * currently hardcodes, so that swap cannot change a number by accident.
 */
import type {
	SystemAttribute,
	SystemCondition,
	SystemConditionDuration,
	SystemConditionSeverity,
	SystemFormula,
	SystemPackage,
	SystemResource,
	SystemSkill,
} from '../state/system-package';

/** The id of the built-in D&D 5e reference package — the default an unconfigured vault hydrates to. */
export const DND5E_SYSTEM_PACKAGE_ID = 'builtin:dnd5e' as const;

// --- Reference tables -----------------------------------------------------------------------------

/**
 * Cumulative experience needed to REACH each level, index 0 = level 1. Mirrors the literal in
 * `state/character-advancement.ts` (which keeps a leading duplicate so it can index by level).
 */
export const DND5E_XP_THRESHOLDS: readonly number[] = Object.freeze([
	0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
	195000, 225000, 265000, 305000, 355000,
]);

/** The highest level a 5e character reaches. */
export const DND5E_LEVEL_CAP = 20 as const;

/**
 * Experience awarded for defeating a creature of each challenge rating. Fractional ratings are
 * keyed by their decimal value (`'0.125'` for CR 1/8) because a record key has to be a string and
 * the encounter maths already stores them that way.
 */
export const DND5E_CR_XP: Readonly<Record<string, number>> = Object.freeze({
	'0': 10,
	'0.125': 25,
	'0.25': 50,
	'0.5': 100,
	'1': 200,
	'2': 450,
	'3': 700,
	'4': 1100,
	'5': 1800,
	'6': 2300,
	'7': 2900,
	'8': 3900,
	'9': 5000,
	'10': 5900,
	'11': 7200,
	'12': 8400,
	'13': 10000,
	'14': 11500,
	'15': 13000,
	'16': 15000,
	'17': 18000,
	'18': 20000,
	'19': 22000,
	'20': 25000,
	'21': 33000,
	'22': 41000,
	'23': 50000,
	'24': 62000,
	'25': 75000,
	'26': 90000,
	'27': 105000,
	'28': 120000,
	'29': 135000,
	'30': 155000,
});

/**
 * Experience for a challenge rating, or `null` when the rating is not on the table. Pure. Callers
 * decide what an off-table rating means rather than getting a silently invented number.
 */
export function dnd5eXpForChallengeRating(challengeRating: number): number | null {
	if (!Number.isFinite(challengeRating)) return null;
	return DND5E_CR_XP[String(challengeRating)] ?? null;
}

/** The hit die each class rolls, in dice notation. */
export const DND5E_CLASS_HIT_DICE: Readonly<Record<string, string>> = Object.freeze({
	barbarian: '1d12',
	bard: '1d8',
	cleric: '1d8',
	druid: '1d8',
	fighter: '1d10',
	monk: '1d8',
	paladin: '1d10',
	ranger: '1d10',
	rogue: '1d8',
	sorcerer: '1d6',
	warlock: '1d8',
	wizard: '1d6',
});

/** The hit die a character with no class recorded defaults to. */
export const DND5E_DEFAULT_HIT_DIE = '1d8' as const;

/**
 * Spell slots a full caster (bard, cleric, druid, sorcerer, wizard) has at each level. Index 0 is
 * level 1; each row lists slots for spell levels 1 through 9, trailing zeroes included so a row is
 * always nine long.
 */
export const DND5E_FULL_CASTER_SLOTS: readonly (readonly number[])[] = Object.freeze([
	Object.freeze([2, 0, 0, 0, 0, 0, 0, 0, 0]),
	Object.freeze([3, 0, 0, 0, 0, 0, 0, 0, 0]),
	Object.freeze([4, 2, 0, 0, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 0, 0, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 2, 0, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 0, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 1, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 2, 0, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 3, 1, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 0, 0, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 0, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 0, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 1, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 1, 0, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 1, 1, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 1, 1, 0]),
	Object.freeze([4, 3, 3, 3, 2, 1, 1, 1, 1]),
	Object.freeze([4, 3, 3, 3, 3, 1, 1, 1, 1]),
	Object.freeze([4, 3, 3, 3, 3, 2, 1, 1, 1]),
	Object.freeze([4, 3, 3, 3, 3, 2, 2, 1, 1]),
]);

/** The highest spell level 5e defines. */
export const DND5E_MAX_SPELL_LEVEL = 9 as const;

/** The ability-score modifier formula, over the identifier `score`. */
export const DND5E_ABILITY_MODIFIER_FORMULA: SystemFormula = 'floor((score-10)/2)';

/** The proficiency-bonus progression, over the identifier `level`: +2 at 1, +1 every four levels. */
export const DND5E_PROFICIENCY_BONUS_FORMULA: SystemFormula = '1+ceil(level/4)';

// --- Formula helpers ------------------------------------------------------------------------------

/**
 * `1` once `level` reaches `at`, `0` below it. The grammar has no comparison operators, so a step is
 * written as a clamp: `max(0, min(1, level - (at - 1)))`.
 */
function unlockedAt(at: number): string {
	return `max(0,min(1,level-${at - 1}))`;
}

/**
 * A staircase over levels: `base` to start, plus one more at each level in `gains`. This is how the
 * class tables that grow in steps (rage, channel divinity, action surge) fit a formula grammar with
 * no conditionals.
 */
function levelSteps(base: number, gains: readonly number[]): SystemFormula {
	const terms = gains.map(unlockedAt);
	if (terms.length === 0) return String(base);
	return base === 0 ? terms.join('+') : `${base}+${terms.join('+')}`;
}

// --- Package parts --------------------------------------------------------------------------------

function attribute(key: string, label: string, abbreviation: string): SystemAttribute {
	return {
		key,
		label,
		abbreviation,
		derivation: { kind: 'modifier', formula: DND5E_ABILITY_MODIFIER_FORMULA },
	};
}

function condition(
	key: string,
	label: string,
	severity: SystemConditionSeverity,
	defaultDuration: SystemConditionDuration = 'until-removed',
	maxStacks: number | null = null,
): SystemCondition {
	return {
		key,
		label,
		icon: `cond-${key}`,
		severity,
		defaultDuration,
		defaultRounds: null,
		maxStacks,
	};
}

function skill(key: string, label: string, attributeKey: string): SystemSkill {
	return { key, label, attribute: attributeKey };
}

function resource(
	key: string,
	label: string,
	kind: SystemResource['kind'],
	maxFormula: SystemFormula | null,
	recovery: SystemResource['recovery'],
	diceNotation: string | null = null,
): SystemResource {
	return { key, label, kind, maxFormula, recovery, diceNotation };
}

/** Spell slots 1–9. The maximum is authored per character: it depends on class and subclass, not level alone. */
function spellSlotResources(): SystemResource[] {
	const slots: SystemResource[] = [];
	for (let level = 1; level <= DND5E_MAX_SPELL_LEVEL; level += 1) {
		slots.push(resource(`spellSlot${level}`, `Level ${level} spell slots`, 'slots', null, 'long'));
	}
	return slots;
}

/**
 * The class resources a 5e sheet tracks, each with the maximum its class table gives at a level.
 * A character only ever shows the ones their class grants; a formula that evaluates to zero is the
 * package saying "this class feature has not come online yet".
 */
function classResources(): SystemResource[] {
	return [
		// Monk: ki equals monk level, from level 2.
		resource('ki', 'Ki points', 'pool', `level*${unlockedAt(2)}`, 'short'),
		// Barbarian: 2, then 3/4/5/6 at levels 3, 6, 12 and 17.
		resource('rage', 'Rage', 'pool', levelSteps(2, [3, 6, 12, 17]), 'long'),
		// Bard: charisma modifier, minimum one. Recovers on a short rest from level 5.
		resource('bardicInspiration', 'Bardic inspiration', 'dice', 'max(1,modifier)', 'short', '1d6'),
		// Cleric and paladin: one use at level 2, two at 6, three at 18.
		resource('channelDivinity', 'Channel divinity', 'pool', levelSteps(0, [2, 6, 18]), 'short'),
		// Sorcerer: sorcery points equal sorcerer level, from level 2.
		resource('sorceryPoints', 'Sorcery points', 'pool', `level*${unlockedAt(2)}`, 'long'),
		// Battle master: four dice at level 3, five at 7, six at 15.
		resource(
			'superiorityDice',
			'Superiority dice',
			'dice',
			`4*${unlockedAt(3)}+${unlockedAt(7)}+${unlockedAt(15)}`,
			'short',
			'1d8',
		),
		// Druid: two uses from level 2.
		resource('wildShape', 'Wild shape', 'pool', `2*${unlockedAt(2)}`, 'short'),
		// Paladin: a pool of five hit points per paladin level.
		resource('layOnHands', 'Lay on hands', 'pool', '5*level', 'long'),
		// Fighter: one use at level 2, a second at 17.
		resource('actionSurge', 'Action surge', 'pool', levelSteps(0, [2, 17]), 'short'),
		// Fighter: one use, back on any rest.
		resource('secondWind', 'Second wind', 'pool', '1', 'short'),
	];
}

function creatureField(
	key: string,
	label: string,
	type: SystemPackage['creatureSchema'][number]['type'],
	required: boolean,
	options: readonly string[] | null = null,
): SystemPackage['creatureSchema'][number] {
	return { key, label, type, required, options };
}

/**
 * The built-in D&D 5e reference package: the value `hydrateSystemsState` seeds an unconfigured
 * vault with, and the one every surface reads until a DM selects another.
 */
export const DND5E_SYSTEM_PACKAGE: SystemPackage = Object.freeze({
	id: DND5E_SYSTEM_PACKAGE_ID,
	version: '1.1.0',
	displayName: 'D&D 5e',
	summary:
		'The fifth-edition reference rules: six abilities, d20 rolls, initiative and levels 1 to 20.',
	vocabulary: Object.freeze({
		gameMaster: 'DM',
		player: 'Player',
		character: 'Character',
		ability: 'Spell',
		abilityPlural: 'Spells',
		levelUpVerb: 'Level up',
		levelNoun: 'Level',
		hitPoints: 'Hit points',
		session: 'Session',
		campaign: 'Campaign',
	}),
	attributes: Object.freeze([
		attribute('strength', 'Strength', 'STR'),
		attribute('dexterity', 'Dexterity', 'DEX'),
		attribute('constitution', 'Constitution', 'CON'),
		attribute('intelligence', 'Intelligence', 'INT'),
		attribute('wisdom', 'Wisdom', 'WIS'),
		attribute('charisma', 'Charisma', 'CHA'),
	]),
	resources: Object.freeze([
		resource('hitPoints', 'Hit points', 'pool', null, 'long'),
		resource('hitDice', 'Hit dice', 'dice', 'level', 'long', DND5E_DEFAULT_HIT_DIE),
		resource('inspiration', 'Inspiration', 'track', '1', 'never'),
		...spellSlotResources(),
		...classResources(),
	]),
	conditions: Object.freeze([
		condition('blinded', 'Blinded', 'major'),
		condition('charmed', 'Charmed', 'major'),
		condition('deafened', 'Deafened', 'major'),
		condition('frightened', 'Frightened', 'major'),
		condition('grappled', 'Grappled', 'major'),
		condition('incapacitated', 'Incapacitated', 'severe'),
		condition('invisible', 'Invisible', 'minor'),
		condition('paralyzed', 'Paralyzed', 'severe'),
		condition('petrified', 'Petrified', 'severe'),
		condition('poisoned', 'Poisoned', 'major'),
		condition('prone', 'Prone', 'minor'),
		condition('restrained', 'Restrained', 'major'),
		condition('stunned', 'Stunned', 'severe'),
		condition('unconscious', 'Unconscious', 'severe'),
		condition('exhaustion', 'Exhaustion', 'severe', 'rest', 6),
	]),
	dice: Object.freeze({
		model: 'd20-plus-modifier' as const,
		notation: '1d20',
		advantage: 'roll-twice-take-best' as const,
		successThreshold: null,
		crit: Object.freeze({ naturalHigh: 20, naturalLow: 1, effect: 'double-dice' as const }),
	}),
	turnModel: Object.freeze({ kind: 'initiative' as const, initiativeFormula: 'modifier' }),
	creatureSchema: Object.freeze([
		creatureField('name', 'Name', 'string', true),
		creatureField('size', 'Size', 'enum', true, [
			'Tiny',
			'Small',
			'Medium',
			'Large',
			'Huge',
			'Gargantuan',
		]),
		creatureField('type', 'Type', 'string', true),
		creatureField('alignment', 'Alignment', 'string', false),
		creatureField('armorClass', 'Armor class', 'number', true),
		creatureField('hitPoints', 'Hit points', 'number', true),
		creatureField('speed', 'Speed', 'string', true),
		creatureField('challengeRating', 'Challenge rating', 'string', true),
		creatureField('notes', 'Notes', 'text', false),
	]),
	advancement: Object.freeze({
		model: 'xp-table' as const,
		levelCap: DND5E_LEVEL_CAP,
		xpThresholds: DND5E_XP_THRESHOLDS,
	}),
	skills: Object.freeze([
		skill('acrobatics', 'Acrobatics', 'dexterity'),
		skill('animal-handling', 'Animal handling', 'wisdom'),
		skill('arcana', 'Arcana', 'intelligence'),
		skill('athletics', 'Athletics', 'strength'),
		skill('deception', 'Deception', 'charisma'),
		skill('history', 'History', 'intelligence'),
		skill('insight', 'Insight', 'wisdom'),
		skill('intimidation', 'Intimidation', 'charisma'),
		skill('investigation', 'Investigation', 'intelligence'),
		skill('medicine', 'Medicine', 'wisdom'),
		skill('nature', 'Nature', 'intelligence'),
		skill('perception', 'Perception', 'wisdom'),
		skill('performance', 'Performance', 'charisma'),
		skill('persuasion', 'Persuasion', 'charisma'),
		skill('religion', 'Religion', 'intelligence'),
		skill('sleight-of-hand', 'Sleight of hand', 'dexterity'),
		skill('stealth', 'Stealth', 'dexterity'),
		skill('survival', 'Survival', 'wisdom'),
	]),
	derived: Object.freeze([
		Object.freeze({
			key: 'proficiencyBonus',
			label: 'Proficiency bonus',
			formula: DND5E_PROFICIENCY_BONUS_FORMULA,
			inputs: Object.freeze(['level']),
		}),
		Object.freeze({
			key: 'abilityModifier',
			label: 'Ability modifier',
			formula: DND5E_ABILITY_MODIFIER_FORMULA,
			inputs: Object.freeze(['score']),
		}),
		Object.freeze({
			key: 'passiveScore',
			label: 'Passive score',
			formula: '10+modifier+proficiency',
			inputs: Object.freeze(['modifier', 'proficiency']),
		}),
		Object.freeze({
			key: 'spellSaveDc',
			label: 'Spell save DC',
			formula: '8+proficiency+modifier',
			inputs: Object.freeze(['proficiency', 'modifier']),
		}),
		Object.freeze({
			key: 'spellAttackBonus',
			label: 'Spell attack bonus',
			formula: 'proficiency+modifier',
			inputs: Object.freeze(['proficiency', 'modifier']),
		}),
	]),
}) as SystemPackage;
