/**
 * RC-SYS-3.5 — the Pathfinder 2e sample package.
 *
 * The point of this sample is that it is written from OUTSIDE the built-in set: it is data in a
 * JSON file, it enters a vault through the ordinary `system.define` command, and nothing anywhere
 * special-cases it. So these tests do not check that PF2e is "correct" as a rules text — they check
 * that a package nobody hard-coded can do everything a built-in can:
 *
 *   - it survives the same `.strict()` schema the vault enforces, which is the only thing standing
 *     between a hand-edited JSON file and a screen rendering nonsense;
 *   - every formula it declares evaluates, at level 1 and at level 20;
 *   - it installs and activates through the real commands, DM-gated, with the dry-run in front;
 *   - once installed it PERSISTS through hydration, unlike a built-in, which is re-seeded from code;
 *   - its three-action turn model resolves to an action budget of three, which is what the tracker
 *     draws as pips (`ds/components/domain/InitiativeRow.jsx`).
 */
import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_SYSTEM_PACKAGE_IDS,
	CUSTOM_SYSTEM_PACKAGE_ID_PATTERN,
	PF2E_SAMPLE_SYSTEM_PACKAGE,
	PF2E_SAMPLE_SYSTEM_PACKAGE_ID,
	STARTER_SYSTEM_LIBRARY,
	activeSystemPackage,
	dispatchCommand,
	evaluateFormula,
	hydrateSystemsState,
	isBuiltInSystemPackageId,
	resolveTurnModel,
	starterSystemPackage,
	systemPackageSchema,
	type CommandResult,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

const pkg = PF2E_SAMPLE_SYSTEM_PACKAGE;

function value(formula: string, scope: Record<string, number>): number {
	const result = evaluateFormula(formula, scope);
	if (!result.ok) throw new Error(`${formula} did not evaluate: ${result.message}`);
	return result.value;
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

/** Install the sample as the DM and hand back the state that now carries it. */
function install(state: CoreStateSlice): CoreStateSlice {
	return accept(
		dispatchCommand(state, makeEnvironment(), {
			type: 'system.define',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		}),
	).nextState;
}

describe('the starter library', () => {
	it('offers Pathfinder 2e as a sample, not as a built-in', () => {
		expect(STARTER_SYSTEM_LIBRARY.map((entry) => entry.id)).toEqual([
			PF2E_SAMPLE_SYSTEM_PACKAGE_ID,
		]);
		expect(starterSystemPackage(PF2E_SAMPLE_SYSTEM_PACKAGE_ID)).toBe(pkg);
		expect(starterSystemPackage('custom:nothing')).toBeUndefined();
		// A sample ships in the build but is NOT built in: nothing seeds it, a DM installs it.
		expect(isBuiltInSystemPackageId(PF2E_SAMPLE_SYSTEM_PACKAGE_ID)).toBe(false);
		expect(BUILT_IN_SYSTEM_PACKAGE_IDS).not.toContain(PF2E_SAMPLE_SYSTEM_PACKAGE_ID);
	});

	it('names the sample in the authorable namespace `system.define` accepts', () => {
		expect(PF2E_SAMPLE_SYSTEM_PACKAGE_ID).toBe('custom:pathfinder-2e');
		expect(CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(PF2E_SAMPLE_SYSTEM_PACKAGE_ID)).toBe(true);
	});
});

describe('the Pathfinder 2e sample as data', () => {
	it('parses through the same strict schema the vault enforces', () => {
		const parsed = systemPackageSchema.safeParse(pkg);
		expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
	});

	it('round-trips through JSON byte-identically', () => {
		expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
	});

	it('declares the six Pathfinder attributes with the 5e-compatible keys', () => {
		expect(pkg.attributes.map((a) => a.key)).toEqual([
			'strength',
			'dexterity',
			'constitution',
			'intelligence',
			'wisdom',
			'charisma',
		]);
		// Sharing 5e's attribute keys is deliberate: a table moving 5e → PF2e carries its ability
		// scores across instead of watching the dry-run drop all six.
		for (const attribute of pkg.attributes) {
			expect(attribute.derivation.kind).toBe('modifier');
			if (attribute.derivation.kind !== 'modifier') continue;
			expect(value(attribute.derivation.formula, { score: 18 })).toBe(4);
			expect(value(attribute.derivation.formula, { score: 7 })).toBe(-2);
		}
	});

	it('scales proficiency and DCs from level 1 to level 20', () => {
		const derived = new Map(pkg.derived.map((entry) => [entry.key, entry]));
		const trained = derived.get('trainedBonus');
		const legendary = derived.get('legendaryBonus');
		const classDc = derived.get('classDc');
		expect(trained && legendary && classDc).toBeTruthy();
		// Trained is level + 2, legendary level + 8 — the tight PF2e proficiency ladder.
		expect(value(trained!.formula, { level: 1 })).toBe(3);
		expect(value(trained!.formula, { level: 20 })).toBe(22);
		expect(value(legendary!.formula, { level: 20 })).toBe(28);
		// A trained level-1 character with a +4 key attribute has a class DC of 17.
		expect(value(classDc!.formula, { level: 1, modifier: 4 })).toBe(17);
	});

	it('evaluates every formula it declares at level 1 and at level 20', () => {
		const scope = (level: number) => ({ level, score: 18, modifier: 4, proficiency: level + 2 });
		for (const level of [1, 20]) {
			for (const resource of pkg.resources) {
				if (resource.maxFormula === null) continue;
				expect(evaluateFormula(resource.maxFormula, scope(level)).ok).toBe(true);
			}
			for (const entry of pkg.derived) {
				expect(evaluateFormula(entry.formula, scope(level)).ok).toBe(true);
			}
		}
	});

	it('advances over twenty levels at a flat 1,000 experience a level', () => {
		expect(pkg.advancement.model).toBe('xp-table');
		expect(pkg.advancement.levelCap).toBe(20);
		expect(pkg.advancement.xpThresholds).toHaveLength(20);
		expect(pkg.advancement.xpThresholds[0]).toBe(0);
		expect(pkg.advancement.xpThresholds[19]).toBe(19000);
	});

	it('carries the Pathfinder conditions, with the ones that stack declaring how far', () => {
		const conditions = new Map(pkg.conditions.map((entry) => [entry.key, entry]));
		for (const key of [
			'off-guard',
			'frightened',
			'clumsy',
			'drained',
			'enfeebled',
			'stupefied',
			'dying',
			'wounded',
			'doomed',
			'quickened',
			'slowed',
			'persistent-damage',
		]) {
			expect(conditions.get(key), `missing condition ${key}`).toBeTruthy();
		}
		// The PF2e value conditions run 1–4 (wounded 1–3); the flat ones declare no stacks at all.
		expect(conditions.get('frightened')!.maxStacks).toBe(4);
		expect(conditions.get('dying')!.maxStacks).toBe(4);
		expect(conditions.get('wounded')!.maxStacks).toBe(3);
		expect(conditions.get('off-guard')!.maxStacks).toBeNull();
		// Frightened ticks down a step a round; persistent damage ends on a flat check.
		expect(conditions.get('frightened')!.defaultDuration).toBe('rounds');
		expect(conditions.get('frightened')!.defaultRounds).toBe(1);
		expect(conditions.get('persistent-damage')!.defaultDuration).toBe('save-ends');
		// Quickened is the one that gives rather than takes.
		expect(conditions.get('quickened')!.severity).toBe('boon');
		// Every icon is a condition glyph from the semantic vocabulary, never a raw Lucide name.
		for (const condition of pkg.conditions) {
			expect(condition.icon, condition.key).toMatch(/^cond-[a-z]+$/);
		}
	});

	it('runs a three-action turn instead of rolling initiative', () => {
		expect(pkg.turnModel).toEqual({ kind: 'actions-per-turn', actionsPerTurn: 3 });
		const resolved = resolveTurnModel(pkg);
		// `actionsPerTurn` is exactly what the tracker row draws as pips.
		expect(resolved.actionsPerTurn).toBe(3);
		expect(resolved.ordered).toBe(true);
		expect(resolved.rounds).toBe(true);
		expect(resolved.initiativeFormula).toBeNull();
	});

	it('reads a d20 with four degrees of success and no advantage', () => {
		expect(pkg.dice.model).toBe('d20-plus-modifier');
		expect(pkg.dice.notation).toBe('1d20');
		// PF2e moves the number with circumstance and status bonuses; it never rolls twice.
		expect(pkg.dice.advantage).toBe('none');
		expect(pkg.dice.crit).toEqual({ naturalHigh: 20, naturalLow: 1, effect: 'double-dice' });
	});
});

describe('installing and activating the sample', () => {
	it('installs through system.define and then activates through system.select', () => {
		const installed = install(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		expect(installed.systems.packages[PF2E_SAMPLE_SYSTEM_PACKAGE_ID]?.displayName).toBe(
			'Pathfinder 2e',
		);
		expect(installed.systems.activePackageId).not.toBe(PF2E_SAMPLE_SYSTEM_PACKAGE_ID);

		const selected = accept(
			dispatchCommand(installed, makeEnvironment(), {
				type: 'system.select',
				actorId: DM_ACTOR.id,
				payload: { packageId: PF2E_SAMPLE_SYSTEM_PACKAGE_ID, acknowledgeLoss: false },
			}),
		).nextState;
		expect(selected.systems.activePackageId).toBe(PF2E_SAMPLE_SYSTEM_PACKAGE_ID);
		expect(activeSystemPackage(selected.systems).vocabulary.gameMaster).toBe('GM');
		expect(resolveTurnModel(activeSystemPackage(selected.systems)).actionsPerTurn).toBe(3);
	});

	it('refuses to let a player install it', () => {
		const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
			type: 'system.define',
			actorId: PLAYER_ACTOR.id,
			payload: { package: pkg },
		});
		expect(result.status).toBe('rejected');
	});

	it('survives hydration, because an installed sample belongs to the vault', () => {
		const installed = install(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		const hydrated = hydrateSystemsState(installed.systems);
		expect(hydrated.packages[PF2E_SAMPLE_SYSTEM_PACKAGE_ID]).toEqual(pkg);
	});
});
