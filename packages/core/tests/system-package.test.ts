import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_SYSTEM_PACKAGES,
	DEFAULT_SYSTEM_PACKAGE_ID,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
	DURABLE_STATE_DOCUMENT_IDS,
	EMPTY_SYSTEMS_STATE,
	SYSTEMS_STATE_SCHEMA_VERSION,
	TARGET_SCHEMA_VERSIONS,
	activeSystemPackage,
	evaluateFormula,
	hydrateSystemsState,
	isValidFormula,
	systemPackageById,
	systemPackageSchema,
	systemsStateSchema,
	type SystemPackage,
	type SystemsState,
} from '../src/index';

/** A tiny valid package that is NOT a built-in, for the custom-package paths. */
function customPackage(id = 'custom:sword-and-sorcery'): SystemPackage {
	return {
		...DND5E_SYSTEM_PACKAGE,
		id,
		displayName: 'Sword and sorcery',
		summary: 'A pared-back custom system for the tests.',
	};
}

describe('RC-SYS-1.1 evaluateFormula', () => {
	it('evaluates arithmetic with the usual precedence and parentheses', () => {
		expect(evaluateFormula('2+3*4')).toEqual({ ok: true, value: 14 });
		expect(evaluateFormula('(2+3)*4')).toEqual({ ok: true, value: 20 });
		expect(evaluateFormula('10/4')).toEqual({ ok: true, value: 2.5 });
		expect(evaluateFormula('1.5+1.5')).toEqual({ ok: true, value: 3 });
	});

	it('evaluates unary minus, including doubled and after an operator', () => {
		expect(evaluateFormula('-5')).toEqual({ ok: true, value: -5 });
		expect(evaluateFormula('3 - -2')).toEqual({ ok: true, value: 5 });
		expect(evaluateFormula('--4')).toEqual({ ok: true, value: 4 });
	});

	it('reads named inputs from the scope', () => {
		expect(evaluateFormula('level*2', { level: 7 })).toEqual({ ok: true, value: 14 });
	});

	it('applies the declared functions, including the two-argument ones', () => {
		expect(evaluateFormula('floor(7/2)')).toEqual({ ok: true, value: 3 });
		expect(evaluateFormula('ceil(7/2)')).toEqual({ ok: true, value: 4 });
		expect(evaluateFormula('round(2.5)')).toEqual({ ok: true, value: 3 });
		expect(evaluateFormula('abs(0-9)')).toEqual({ ok: true, value: 9 });
		expect(evaluateFormula('min(3,8)')).toEqual({ ok: true, value: 3 });
		expect(evaluateFormula('max(3,8)')).toEqual({ ok: true, value: 8 });
	});

	it('computes the 5e ability modifier across the score range', () => {
		const modifier = (score: number) => evaluateFormula('floor((score-10)/2)', { score });
		expect(modifier(1)).toEqual({ ok: true, value: -5 });
		expect(modifier(8)).toEqual({ ok: true, value: -1 });
		expect(modifier(10)).toEqual({ ok: true, value: 0 });
		expect(modifier(11)).toEqual({ ok: true, value: 0 });
		expect(modifier(15)).toEqual({ ok: true, value: 2 });
		expect(modifier(20)).toEqual({ ok: true, value: 5 });
	});

	it('computes the 5e proficiency bonus across levels 1 to 20', () => {
		const expected = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
		for (const [index, bonus] of expected.entries()) {
			expect(evaluateFormula('1+ceil(level/4)', { level: index + 1 })).toEqual({
				ok: true,
				value: bonus,
			});
		}
	});

	it('fails closed with a typed reason instead of throwing', () => {
		expect(evaluateFormula('')).toMatchObject({ ok: false, reason: 'empty' });
		expect(evaluateFormula('   ')).toMatchObject({ ok: false, reason: 'empty' });
		expect(evaluateFormula('2+')).toMatchObject({ ok: false, reason: 'syntax' });
		expect(evaluateFormula('2 3')).toMatchObject({ ok: false, reason: 'syntax' });
		expect(evaluateFormula('(2+3')).toMatchObject({ ok: false, reason: 'syntax' });
		expect(evaluateFormula('2 $ 3')).toMatchObject({ ok: false, reason: 'syntax' });
		expect(evaluateFormula('level+1')).toMatchObject({ ok: false, reason: 'unknown-identifier' });
		expect(evaluateFormula('sqrt(4)')).toMatchObject({ ok: false, reason: 'unknown-function' });
		expect(evaluateFormula('min(4)')).toMatchObject({ ok: false, reason: 'arity' });
		expect(evaluateFormula('4/0')).toMatchObject({ ok: false, reason: 'divide-by-zero' });
		expect(evaluateFormula('score', { score: Number.NaN })).toMatchObject({
			ok: false,
			reason: 'not-finite',
		});
	});

	it('never reaches the host: property access and calls are not grammar', () => {
		expect(evaluateFormula('constructor')).toMatchObject({ ok: false });
		expect(evaluateFormula('a.b', { a: 1 })).toMatchObject({ ok: false, reason: 'syntax' });
		expect(evaluateFormula('globalThis')).toMatchObject({
			ok: false,
			reason: 'unknown-identifier',
		});
		expect(evaluateFormula('toString')).toMatchObject({ ok: false, reason: 'unknown-identifier' });
	});

	it('isValidFormula checks parseability against the identifiers a site supplies', () => {
		expect(isValidFormula('1+ceil(level/4)', ['level'])).toBe(true);
		expect(isValidFormula('1+ceil(level/4)', [])).toBe(false);
		expect(isValidFormula('floor((score-10)/2)', ['score'])).toBe(true);
		expect(isValidFormula('nope(', ['score'])).toBe(false);
	});
});

describe('RC-SYS-1.1 systemPackageSchema', () => {
	it('accepts the built-in 5e package', () => {
		expect(systemPackageSchema.safeParse(DND5E_SYSTEM_PACKAGE).success).toBe(true);
	});

	it('round-trips the built-in 5e package through JSON without loss', () => {
		const roundTripped = JSON.parse(JSON.stringify(DND5E_SYSTEM_PACKAGE)) as unknown;
		const parsed = systemPackageSchema.safeParse(roundTripped);
		expect(parsed.success).toBe(true);
		expect(roundTripped).toEqual(DND5E_SYSTEM_PACKAGE);
	});

	it('rejects an unknown key at the top level', () => {
		const parsed = systemPackageSchema.safeParse({ ...DND5E_SYSTEM_PACKAGE, houseRules: true });
		expect(parsed.success).toBe(false);
	});

	it('rejects an unknown key nested inside vocabulary, an attribute and dice', () => {
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				vocabulary: { ...DND5E_SYSTEM_PACKAGE.vocabulary, dungeon: 'Dungeon' },
			}).success,
		).toBe(false);
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				attributes: [{ ...DND5E_SYSTEM_PACKAGE.attributes[0], hidden: true }],
			}).success,
		).toBe(false);
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				dice: { ...DND5E_SYSTEM_PACKAGE.dice, explodes: true },
			}).success,
		).toBe(false);
	});

	it('rejects a skill that keys off an attribute the package does not declare', () => {
		const parsed = systemPackageSchema.safeParse({
			...DND5E_SYSTEM_PACKAGE,
			skills: [{ key: 'piloting', label: 'Piloting', attribute: 'reflexes' }],
		});
		expect(parsed.success).toBe(false);
	});

	it('rejects an unparseable formula wherever a formula is declared', () => {
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				attributes: [
					{
						key: 'strength',
						label: 'Strength',
						abbreviation: 'STR',
						derivation: { kind: 'modifier', formula: 'floor((score-10)/' },
					},
				],
			}).success,
		).toBe(false);
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				derived: [{ key: 'bonus', label: 'Bonus', formula: 'mystery*2', inputs: ['level'] }],
			}).success,
		).toBe(false);
	});

	it('rejects an enum creature field with no options and an xp-table with no thresholds', () => {
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				creatureSchema: [
					{ key: 'size', label: 'Size', type: 'enum', required: true, options: null },
				],
			}).success,
		).toBe(false);
		expect(
			systemPackageSchema.safeParse({
				...DND5E_SYSTEM_PACKAGE,
				advancement: { model: 'xp-table', levelCap: 20, xpThresholds: [] },
			}).success,
		).toBe(false);
	});

	it('accepts a milestone system with no attributes, no skills and no turn order', () => {
		const parsed = systemPackageSchema.safeParse({
			...DND5E_SYSTEM_PACKAGE,
			id: 'builtin:generic',
			displayName: 'Generic',
			summary: 'A narrative system with no attributes and no turn order.',
			attributes: [],
			skills: [],
			derived: [],
			turnModel: { kind: 'none' },
			advancement: { model: 'milestone', levelCap: null, xpThresholds: [] },
			dice: {
				model: 'dice-pool',
				notation: '5d6',
				advantage: 'extra-die',
				successThreshold: 5,
				crit: { naturalHigh: null, naturalLow: null, effect: 'none' },
			},
		});
		expect(parsed.success).toBe(true);
	});

	it('validates the whole systems document, unknown keys included', () => {
		expect(systemsStateSchema.safeParse(EMPTY_SYSTEMS_STATE).success).toBe(true);
		expect(
			systemsStateSchema.safeParse({ ...EMPTY_SYSTEMS_STATE, lastSwitchedAt: '2026-09-05' })
				.success,
		).toBe(false);
		expect(systemsStateSchema.safeParse({ ...EMPTY_SYSTEMS_STATE, schemaVersion: 2 }).success).toBe(
			false,
		);
	});
});

describe('RC-SYS-1.1 hydrateSystemsState', () => {
	it('yields the 5e default for an absent slice', () => {
		const state = hydrateSystemsState(undefined);
		expect(state.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
		expect(state.activeWidgetPackageId).toBeNull();
		expect(state.schemaVersion).toBe(SYSTEMS_STATE_SCHEMA_VERSION);
		expect(activeSystemPackage(state)).toEqual(DND5E_SYSTEM_PACKAGE);
		expect(state).toEqual(EMPTY_SYSTEMS_STATE);
	});

	it('carries a legacy widgets.activeSystemPackageId across into the new slice', () => {
		const state = hydrateSystemsState(undefined, { activeSystemPackageId: 'pkg.tavern' });
		expect(state.activeWidgetPackageId).toBe('pkg.tavern');
		// The legacy value is a WIDGET package id, so it never becomes the SystemPackage id.
		expect(state.activePackageId).toBe(DEFAULT_SYSTEM_PACKAGE_ID);
	});

	it('ignores an absent or empty legacy value', () => {
		expect(hydrateSystemsState(undefined, {}).activeWidgetPackageId).toBeNull();
		expect(
			hydrateSystemsState(undefined, { activeSystemPackageId: null }).activeWidgetPackageId,
		).toBeNull();
		expect(
			hydrateSystemsState(undefined, { activeSystemPackageId: '' }).activeWidgetPackageId,
		).toBeNull();
	});

	it('prefers a persisted activeWidgetPackageId over the legacy one', () => {
		const persisted: SystemsState = {
			...EMPTY_SYSTEMS_STATE,
			packages: { ...EMPTY_SYSTEMS_STATE.packages },
			activeWidgetPackageId: 'pkg.current',
		};
		const state = hydrateSystemsState(persisted, { activeSystemPackageId: 'pkg.stale' });
		expect(state.activeWidgetPackageId).toBe('pkg.current');
	});

	it('keeps authored packages and always re-seeds the built-ins from the build', () => {
		const custom = customPackage();
		const state = hydrateSystemsState({
			packages: { [custom.id]: custom },
			activePackageId: custom.id,
			activeWidgetPackageId: null,
			schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
		});
		expect(systemPackageById(state, custom.id)).toEqual(custom);
		expect(systemPackageById(state, DND5E_SYSTEM_PACKAGE_ID)).toEqual(DND5E_SYSTEM_PACKAGE);
		expect(state.activePackageId).toBe(custom.id);
	});

	it('falls back to the default when the active package no longer resolves', () => {
		const state = hydrateSystemsState({
			packages: {},
			activePackageId: 'custom:deleted',
			activeWidgetPackageId: null,
			schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
		});
		expect(state.activePackageId).toBe(DEFAULT_SYSTEM_PACKAGE_ID);
		expect(activeSystemPackage(state)).toEqual(DND5E_SYSTEM_PACKAGE);
	});

	it('drops a persisted entry that is not a package at all', () => {
		const state = hydrateSystemsState({
			packages: { broken: null as unknown as SystemPackage, alsoBroken: {} as SystemPackage },
			activePackageId: DND5E_SYSTEM_PACKAGE_ID,
			activeWidgetPackageId: null,
			schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
		});
		expect(Object.keys(state.packages).sort()).toEqual(
			BUILT_IN_SYSTEM_PACKAGES.map((pkg) => pkg.id).sort(),
		);
	});

	it('round-trips a hydrated slice through JSON unchanged', () => {
		const custom = customPackage();
		const first = hydrateSystemsState({
			packages: { [custom.id]: custom },
			activePackageId: custom.id,
			activeWidgetPackageId: 'pkg.tavern',
			schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
		});
		const persisted = JSON.parse(JSON.stringify(first)) as SystemsState;
		expect(persisted).toEqual(first);
		expect(hydrateSystemsState(persisted)).toEqual(first);
		expect(systemsStateSchema.safeParse(persisted).success).toBe(true);
	});

	it('clones rather than aliases, so a hydrated slice cannot mutate the built-in', () => {
		const state = hydrateSystemsState(undefined);
		expect(state.packages[DND5E_SYSTEM_PACKAGE_ID]).not.toBe(DND5E_SYSTEM_PACKAGE);
		expect(state.packages[DND5E_SYSTEM_PACKAGE_ID]?.attributes).not.toBe(
			DND5E_SYSTEM_PACKAGE.attributes,
		);
	});
});

describe('RC-SYS-1.1 the systems durable document', () => {
	it('participates in migration at schema version 1', () => {
		expect(DURABLE_STATE_DOCUMENT_IDS).toContain('systems');
		expect(TARGET_SCHEMA_VERSIONS.systems).toBe(1);
		expect(SYSTEMS_STATE_SCHEMA_VERSION).toBe(1);
	});
});

describe('RC-SYS-1.1 the built-in 5e package', () => {
	it('declares the six abilities, each deriving a modifier', () => {
		expect(DND5E_SYSTEM_PACKAGE.attributes.map((a) => a.key)).toEqual([
			'strength',
			'dexterity',
			'constitution',
			'intelligence',
			'wisdom',
			'charisma',
		]);
		for (const attribute of DND5E_SYSTEM_PACKAGE.attributes) {
			expect(attribute.derivation.kind).toBe('modifier');
		}
	});

	it('declares the 15 conditions with icons from the semantic icon vocabulary', () => {
		expect(DND5E_SYSTEM_PACKAGE.conditions).toHaveLength(15);
		for (const condition of DND5E_SYSTEM_PACKAGE.conditions) {
			expect(condition.icon).toBe(`cond-${condition.key}`);
		}
		expect(DND5E_SYSTEM_PACKAGE.conditions.find((c) => c.key === 'exhaustion')?.maxStacks).toBe(6);
	});

	it('declares the 18 skills, each keyed off a declared attribute', () => {
		const attributeKeys = new Set(DND5E_SYSTEM_PACKAGE.attributes.map((a) => a.key));
		expect(DND5E_SYSTEM_PACKAGE.skills).toHaveLength(18);
		for (const skill of DND5E_SYSTEM_PACKAGE.skills) {
			expect(attributeKeys.has(skill.attribute ?? '')).toBe(true);
		}
	});

	it('declares the level 1 to 20 experience table and a level cap of 20', () => {
		expect(DND5E_SYSTEM_PACKAGE.advancement.model).toBe('xp-table');
		expect(DND5E_SYSTEM_PACKAGE.advancement.levelCap).toBe(20);
		expect(DND5E_SYSTEM_PACKAGE.advancement.xpThresholds).toHaveLength(20);
		expect(DND5E_SYSTEM_PACKAGE.advancement.xpThresholds[0]).toBe(0);
		expect(DND5E_SYSTEM_PACKAGE.advancement.xpThresholds[19]).toBe(355000);
	});

	it('every declared formula parses against the inputs its site supplies', () => {
		for (const attribute of DND5E_SYSTEM_PACKAGE.attributes) {
			if (attribute.derivation.kind === 'modifier') {
				expect(isValidFormula(attribute.derivation.formula, ['score'])).toBe(true);
			}
		}
		for (const resource of DND5E_SYSTEM_PACKAGE.resources) {
			if (resource.maxFormula !== null) {
				expect(isValidFormula(resource.maxFormula, ['level', 'score', 'modifier'])).toBe(true);
			}
		}
		for (const derived of DND5E_SYSTEM_PACKAGE.derived) {
			expect(isValidFormula(derived.formula, derived.inputs)).toBe(true);
		}
	});

	it('carries a d20 dice model with 5e crit rules and initiative turn order', () => {
		expect(DND5E_SYSTEM_PACKAGE.dice.model).toBe('d20-plus-modifier');
		expect(DND5E_SYSTEM_PACKAGE.dice.notation).toBe('1d20');
		expect(DND5E_SYSTEM_PACKAGE.dice.advantage).toBe('roll-twice-take-best');
		expect(DND5E_SYSTEM_PACKAGE.dice.crit).toEqual({
			naturalHigh: 20,
			naturalLow: 1,
			effect: 'double-dice',
		});
		expect(DND5E_SYSTEM_PACKAGE.turnModel.kind).toBe('initiative');
	});
});
