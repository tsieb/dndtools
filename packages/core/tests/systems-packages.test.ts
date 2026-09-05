/**
 * RC-SYS-1.2 — the built-in packages.
 *
 * Two jobs. First, SNAPSHOTS: the shape of each shipped package is pinned, so a change to 5e or to
 * Generic is a visible diff in a review rather than a quiet drift in what every screen reads.
 *
 * Second, PARITY: every 5e constant core currently hardcodes is asserted equal to the value the
 * package carries. SYS-2 is going to delete those literals and read the package instead; these
 * tests are what makes that swap safe, because a mismatch fails here before it can change a number
 * on a character sheet.
 */
import { describe, expect, it } from 'vitest';
import {
	ABILITY_IDS,
	BUILT_IN_SYSTEM_PACKAGES,
	BUILT_IN_SYSTEM_PACKAGE_IDS,
	DND5E_ABILITY_MODIFIER_FORMULA,
	DND5E_CLASS_HIT_DICE,
	DND5E_CR_XP,
	DND5E_DEFAULT_HIT_DIE,
	DND5E_FULL_CASTER_SLOTS,
	DND5E_LEVEL_CAP,
	DND5E_MAX_SPELL_LEVEL,
	DND5E_PROFICIENCY_BONUS_FORMULA,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
	DND5E_XP_THRESHOLDS,
	EMPTY_CHARACTER_PROFICIENCIES,
	GENERIC_APPROACHES,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	MAX_CHARACTER_LEVEL,
	XP_THRESHOLDS,
	abilityModifier,
	builtInSystemPackage,
	challengePointsForCr,
	createGenericSystemPackage,
	derivedProficiencyBonus,
	dnd5eXpForChallengeRating,
	evaluateFormula,
	isBuiltInSystemPackageId,
	systemPackageSchema,
	xpForLevel,
} from '../src/index';

function formulaValue(formula: string, scope: Record<string, number>): number {
	const result = evaluateFormula(formula, scope);
	if (!result.ok) throw new Error(`${formula} did not evaluate: ${result.message}`);
	return result.value;
}

function resourceMax(packageId: string, key: string, scope: Record<string, number>): number {
	const pkg = builtInSystemPackage(packageId);
	const resource = pkg?.resources.find((entry) => entry.key === key);
	if (!resource?.maxFormula) throw new Error(`${key} has no max formula.`);
	return formulaValue(resource.maxFormula, {
		level: 0,
		score: 0,
		modifier: 0,
		proficiency: 0,
		...scope,
	});
}

const dnd5eMax = (key: string, level: number, modifier = 0): number =>
	resourceMax(DND5E_SYSTEM_PACKAGE_ID, key, { level, modifier });

describe('the built-in registry', () => {
	it('ships D&D 5e and Generic, in picker order', () => {
		expect(BUILT_IN_SYSTEM_PACKAGES.map((pkg) => pkg.id)).toEqual([
			DND5E_SYSTEM_PACKAGE_ID,
			GENERIC_SYSTEM_PACKAGE_ID,
		]);
		expect(BUILT_IN_SYSTEM_PACKAGE_IDS).toEqual(BUILT_IN_SYSTEM_PACKAGES.map((pkg) => pkg.id));
	});

	it('tells a shipped package from an authored one', () => {
		expect(isBuiltInSystemPackageId(DND5E_SYSTEM_PACKAGE_ID)).toBe(true);
		expect(isBuiltInSystemPackageId(GENERIC_SYSTEM_PACKAGE_ID)).toBe(true);
		expect(isBuiltInSystemPackageId('custom:homebrew')).toBe(false);
		expect(builtInSystemPackage('custom:homebrew')).toBeUndefined();
	});

	it('validates every built-in against the strict schema', () => {
		for (const pkg of BUILT_IN_SYSTEM_PACKAGES) {
			const parsed = systemPackageSchema.safeParse(pkg);
			expect(parsed.error?.issues ?? []).toEqual([]);
			expect(parsed.success).toBe(true);
		}
	});

	it('gives every built-in unique keys within each collection', () => {
		for (const pkg of BUILT_IN_SYSTEM_PACKAGES) {
			for (const collection of [
				pkg.attributes,
				pkg.resources,
				pkg.conditions,
				pkg.creatureSchema,
				pkg.skills,
				pkg.derived,
			]) {
				const keys = collection.map((entry) => entry.key);
				expect(new Set(keys).size).toBe(keys.length);
			}
		}
	});
});

describe('the D&D 5e package', () => {
	it('matches its snapshot', () => {
		expect(DND5E_SYSTEM_PACKAGE).toMatchSnapshot();
	});

	it('carries the six abilities', () => {
		expect(DND5E_SYSTEM_PACKAGE.attributes.map((a) => a.abbreviation)).toEqual([
			'STR',
			'DEX',
			'CON',
			'INT',
			'WIS',
			'CHA',
		]);
	});

	it('carries the fifteen conditions with the icon names the design system registers', () => {
		// Entries 1-15 of `CONDITIONS` in apps/gm-react/src/ds/components/condition/ConditionBadge.jsx.
		expect(DND5E_SYSTEM_PACKAGE.conditions.map((c) => [c.key, c.icon])).toEqual([
			['blinded', 'cond-blinded'],
			['charmed', 'cond-charmed'],
			['deafened', 'cond-deafened'],
			['frightened', 'cond-frightened'],
			['grappled', 'cond-grappled'],
			['incapacitated', 'cond-incapacitated'],
			['invisible', 'cond-invisible'],
			['paralyzed', 'cond-paralyzed'],
			['petrified', 'cond-petrified'],
			['poisoned', 'cond-poisoned'],
			['prone', 'cond-prone'],
			['restrained', 'cond-restrained'],
			['stunned', 'cond-stunned'],
			['unconscious', 'cond-unconscious'],
			['exhaustion', 'cond-exhaustion'],
		]);
		const exhaustion = DND5E_SYSTEM_PACKAGE.conditions.at(-1);
		expect(exhaustion?.maxStacks).toBe(6);
	});

	it('carries spell slots 1 to 9', () => {
		const slots = DND5E_SYSTEM_PACKAGE.resources.filter((r) => r.kind === 'slots');
		expect(slots.map((r) => r.key)).toEqual([
			'spellSlot1',
			'spellSlot2',
			'spellSlot3',
			'spellSlot4',
			'spellSlot5',
			'spellSlot6',
			'spellSlot7',
			'spellSlot8',
			'spellSlot9',
		]);
		expect(slots).toHaveLength(DND5E_MAX_SPELL_LEVEL);
		// The maximum is authored per character: it depends on class and subclass, not level alone.
		expect(slots.every((r) => r.maxFormula === null)).toBe(true);
		expect(slots.every((r) => r.recovery === 'long')).toBe(true);
	});

	it('gives hit dice one die per level', () => {
		const hitDice = DND5E_SYSTEM_PACKAGE.resources.find((r) => r.key === 'hitDice');
		expect(hitDice?.kind).toBe('dice');
		expect(hitDice?.diceNotation).toBe(DND5E_DEFAULT_HIT_DIE);
		expect(dnd5eMax('hitDice', 7)).toBe(7);
	});

	it('carries the eighteen skills, each keyed off a declared attribute', () => {
		expect(DND5E_SYSTEM_PACKAGE.skills).toHaveLength(18);
		const attributeKeys = new Set(DND5E_SYSTEM_PACKAGE.attributes.map((a) => a.key));
		for (const entry of DND5E_SYSTEM_PACKAGE.skills) {
			expect(attributeKeys.has(entry.attribute ?? '')).toBe(true);
		}
		expect(DND5E_SYSTEM_PACKAGE.skills.find((s) => s.key === 'perception')?.attribute).toBe(
			'wisdom',
		);
	});

	it('rolls a d20 with advantage as roll-twice-take-best and crits on a natural 20', () => {
		expect(DND5E_SYSTEM_PACKAGE.dice.notation).toBe('1d20');
		expect(DND5E_SYSTEM_PACKAGE.dice.advantage).toBe('roll-twice-take-best');
		expect(DND5E_SYSTEM_PACKAGE.dice.crit).toEqual({
			naturalHigh: 20,
			naturalLow: 1,
			effect: 'double-dice',
		});
	});
});

describe('the 5e class-resource maximums', () => {
	it('gives a monk ki equal to their level, from level 2', () => {
		expect(dnd5eMax('ki', 1)).toBe(0);
		expect(dnd5eMax('ki', 2)).toBe(2);
		expect(dnd5eMax('ki', 20)).toBe(20);
	});

	it('steps rage at levels 3, 6, 12 and 17', () => {
		expect([1, 2, 3, 5, 6, 11, 12, 16, 17, 20].map((level) => dnd5eMax('rage', level))).toEqual([
			2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
		]);
	});

	it('gives bardic inspiration a charisma modifier, minimum one', () => {
		expect(dnd5eMax('bardicInspiration', 1, -1)).toBe(1);
		expect(dnd5eMax('bardicInspiration', 1, 0)).toBe(1);
		expect(dnd5eMax('bardicInspiration', 1, 4)).toBe(4);
	});

	it('unlocks channel divinity at level 2 and steps it at 6 and 18', () => {
		expect([1, 2, 5, 6, 17, 18].map((level) => dnd5eMax('channelDivinity', level))).toEqual([
			0, 1, 1, 2, 2, 3,
		]);
	});

	it('gives a sorcerer sorcery points equal to their level, from level 2', () => {
		expect([1, 2, 20].map((level) => dnd5eMax('sorceryPoints', level))).toEqual([0, 2, 20]);
	});

	it('gives a battle master four superiority dice at level 3, five at 7 and six at 15', () => {
		expect([2, 3, 6, 7, 14, 15].map((level) => dnd5eMax('superiorityDice', level))).toEqual([
			0, 4, 4, 5, 5, 6,
		]);
	});

	it('gives a druid two wild shapes from level 2', () => {
		expect([1, 2, 20].map((level) => dnd5eMax('wildShape', level))).toEqual([0, 2, 2]);
	});

	it('gives a paladin five lay-on-hands points per level', () => {
		expect([1, 5, 20].map((level) => dnd5eMax('layOnHands', level))).toEqual([5, 25, 100]);
	});

	it('gives a fighter one action surge at level 2 and a second at 17', () => {
		expect([1, 2, 16, 17].map((level) => dnd5eMax('actionSurge', level))).toEqual([0, 1, 1, 2]);
	});

	it('gives a fighter one second wind at every level', () => {
		expect([1, 20].map((level) => dnd5eMax('secondWind', level))).toEqual([1, 1]);
	});

	it('recovers each class resource on the rest its class table names', () => {
		const recoveries = Object.fromEntries(
			DND5E_SYSTEM_PACKAGE.resources.map((r) => [r.key, r.recovery]),
		);
		expect(recoveries).toMatchObject({
			ki: 'short',
			rage: 'long',
			bardicInspiration: 'short',
			channelDivinity: 'short',
			sorceryPoints: 'long',
			superiorityDice: 'short',
			wildShape: 'short',
			layOnHands: 'long',
			actionSurge: 'short',
			secondWind: 'short',
		});
	});
});

describe('the 5e reference tables', () => {
	it('maps every tabled challenge rating to its experience award', () => {
		expect(dnd5eXpForChallengeRating(0)).toBe(10);
		expect(dnd5eXpForChallengeRating(0.25)).toBe(50);
		expect(dnd5eXpForChallengeRating(1)).toBe(200);
		expect(dnd5eXpForChallengeRating(20)).toBe(25000);
		expect(dnd5eXpForChallengeRating(30)).toBe(155000);
	});

	it('tables every challenge rating from 0 to 30', () => {
		expect(Object.keys(DND5E_CR_XP)).toHaveLength(34);
		expect(DND5E_CR_XP['0.125']).toBe(25);
		// Read in rating order, not key order: a record puts its integer-like keys first.
		const ratings = Object.keys(DND5E_CR_XP)
			.map(Number)
			.sort((a, b) => a - b);
		const awards = ratings.map((cr) => DND5E_CR_XP[String(cr)] ?? 0);
		expect(awards.every((xp, index) => index === 0 || xp > (awards[index - 1] ?? 0))).toBe(true);
	});

	it('refuses a challenge rating that is not on the table', () => {
		expect(dnd5eXpForChallengeRating(31)).toBeNull();
		expect(dnd5eXpForChallengeRating(1.5)).toBeNull();
		expect(dnd5eXpForChallengeRating(Number.NaN)).toBeNull();
	});

	it('gives a full caster the published slot progression', () => {
		expect(DND5E_FULL_CASTER_SLOTS).toHaveLength(DND5E_LEVEL_CAP);
		expect(DND5E_FULL_CASTER_SLOTS.every((row) => row.length === DND5E_MAX_SPELL_LEVEL)).toBe(true);
		expect(DND5E_FULL_CASTER_SLOTS[0]).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(DND5E_FULL_CASTER_SLOTS[4]).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
		expect(DND5E_FULL_CASTER_SLOTS[19]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
	});

	it('gives every class a hit die', () => {
		expect(Object.keys(DND5E_CLASS_HIT_DICE)).toHaveLength(12);
		expect(DND5E_CLASS_HIT_DICE.barbarian).toBe('1d12');
		expect(DND5E_CLASS_HIT_DICE.wizard).toBe('1d6');
		expect(new Set(Object.values(DND5E_CLASS_HIT_DICE))).toEqual(
			new Set(['1d6', '1d8', '1d10', '1d12']),
		);
	});
});

describe('parity with the 5e constants core hardcodes today', () => {
	it('matches state/character-advancement.ts ABILITY level cap', () => {
		expect(DND5E_SYSTEM_PACKAGE.advancement.levelCap).toBe(MAX_CHARACTER_LEVEL);
		expect(DND5E_LEVEL_CAP).toBe(MAX_CHARACTER_LEVEL);
	});

	it('matches state/character-advancement.ts XP_THRESHOLDS at every level', () => {
		// The core literal keeps a leading duplicate so it can index by level; the package does not.
		expect(DND5E_XP_THRESHOLDS).toEqual(XP_THRESHOLDS.slice(1));
		expect(DND5E_SYSTEM_PACKAGE.advancement.xpThresholds).toEqual(DND5E_XP_THRESHOLDS);
		for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
			expect(DND5E_XP_THRESHOLDS[level - 1]).toBe(xpForLevel(level));
		}
	});

	it('matches state/encounter.ts challengePointsForCr on every rating it tables', () => {
		// The encounter maths counts challenge POINTS, which are the 5e experience award over ten.
		for (const cr of [0, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
			expect(dnd5eXpForChallengeRating(cr)).toBe(challengePointsForCr(cr) * 10);
		}
	});

	it('records the one place state/encounter.ts rounded the CR table', () => {
		// CR 1/8 awards 25 XP, which is 2.5 challenge points; the encounter table rounded it down to
		// 2. Pinned rather than fixed: changing it would move every existing encounter's difficulty
		// band, which is SYS-2's call to make deliberately, not a side effect of this story.
		expect(dnd5eXpForChallengeRating(0.125)).toBe(25);
		expect(challengePointsForCr(0.125)).toBe(2);
	});

	it('matches queries/character-query.ts derivedProficiencyBonus at every level', () => {
		const derived = DND5E_SYSTEM_PACKAGE.derived.find((d) => d.key === 'proficiencyBonus');
		expect(derived?.formula).toBe(DND5E_PROFICIENCY_BONUS_FORMULA);
		for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
			expect(formulaValue(DND5E_PROFICIENCY_BONUS_FORMULA, { level })).toBe(
				derivedProficiencyBonus(level),
			);
		}
	});

	it('matches queries/character-query.ts abilityModifier across the whole score range', () => {
		for (const attribute of DND5E_SYSTEM_PACKAGE.attributes) {
			expect(attribute.derivation).toEqual({
				kind: 'modifier',
				formula: DND5E_ABILITY_MODIFIER_FORMULA,
			});
		}
		for (let score = 1; score <= 30; score += 1) {
			expect(formulaValue(DND5E_ABILITY_MODIFIER_FORMULA, { score })).toBe(abilityModifier(score));
		}
	});

	it('matches state/character-draft-flow.ts ABILITY_IDS', () => {
		expect(DND5E_SYSTEM_PACKAGE.attributes.map((a) => a.abbreviation.toLowerCase())).toEqual([
			...ABILITY_IDS,
		]);
	});

	it('matches the default hit die on state/character-state.ts EMPTY_CHARACTER_PROFICIENCIES', () => {
		// The character sheet stores the die alone ("d8"); the package stores full notation ("1d8").
		expect(DND5E_DEFAULT_HIT_DIE).toBe(`1${EMPTY_CHARACTER_PROFICIENCIES.hitDice.die}`);
	});

	it('matches the spell-slot bound schemas/commands.ts enforces', () => {
		expect(DND5E_MAX_SPELL_LEVEL).toBe(9);
	});
});

describe('the Generic package', () => {
	it('matches its snapshot', () => {
		expect(GENERIC_SYSTEM_PACKAGE).toMatchSnapshot();
	});

	it('has no attributes, no skills and no derived values by default', () => {
		expect(GENERIC_SYSTEM_PACKAGE.attributes).toEqual([]);
		expect(GENERIC_SYSTEM_PACKAGE.skills).toEqual([]);
		expect(GENERIC_SYSTEM_PACKAGE.derived).toEqual([]);
	});

	it('tracks health and stress', () => {
		expect(GENERIC_SYSTEM_PACKAGE.resources.map((r) => r.key)).toEqual(['hp', 'stress']);
		expect(resourceMax(GENERIC_SYSTEM_PACKAGE_ID, 'stress', {})).toBe(6);
	});

	it('carries four conditions, each with an icon the design system registers', () => {
		expect(GENERIC_SYSTEM_PACKAGE.conditions.map((c) => [c.key, c.icon])).toEqual([
			['hindered', 'cond-restrained'],
			['afraid', 'cond-frightened'],
			['hidden', 'cond-invisible'],
			['inspired', 'cond-blessed'],
		]);
	});

	it('rolls a pool of d6s and counts successes', () => {
		expect(GENERIC_SYSTEM_PACKAGE.dice.model).toBe('dice-pool');
		expect(GENERIC_SYSTEM_PACKAGE.dice.notation).toBe('1d6');
		expect(GENERIC_SYSTEM_PACKAGE.dice.successThreshold).toBe(4);
	});

	it('has no turn order and advances on milestones', () => {
		expect(GENERIC_SYSTEM_PACKAGE.turnModel).toEqual({ kind: 'none' });
		expect(GENERIC_SYSTEM_PACKAGE.advancement).toEqual({
			model: 'milestone',
			levelCap: null,
			xpThresholds: [],
		});
	});

	it('takes a freeform creature: a name and nothing else required', () => {
		expect(
			GENERIC_SYSTEM_PACKAGE.creatureSchema.filter((f) => f.required).map((f) => f.key),
		).toEqual(['name']);
	});

	it('turns on three approaches and their skills behind the flag', () => {
		const withApproaches = createGenericSystemPackage({ approaches: true });
		expect(withApproaches.attributes.map((a) => a.key)).toEqual(['force', 'finesse', 'focus']);
		expect(withApproaches.attributes.every((a) => a.derivation.kind === 'none')).toBe(true);
		expect(withApproaches.skills.map((s) => s.attribute)).toEqual(['force', 'finesse', 'focus']);
		expect(systemPackageSchema.safeParse(withApproaches).success).toBe(true);
		expect(GENERIC_APPROACHES.map((a) => a.key)).toEqual(['force', 'finesse', 'focus']);
	});

	it('returns a fresh package every call, so a caller can fork without cloning', () => {
		const first = createGenericSystemPackage();
		const second = createGenericSystemPackage();
		expect(first).toEqual(second);
		expect(first.resources).not.toBe(second.resources);
	});
});
