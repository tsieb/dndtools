import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	dispatchCommand,
	isSystemCondition,
	resolveCombatantConditions,
	resolveCondition,
	systemConditionCatalog,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-SYS-2.3 — the combat tracker's conditions come from the ACTIVE system package: the picker
 * lists what the package declares, adding anything else is refused, and a key left over from
 * another package still resolves honestly so it can be seen and cleared.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

/** An active session with combat running, plus the Ogre's combatant id. */
function runningCombat(activePackageId?: string): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	ogreId: string;
} {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
		}),
	).nextState;
	const switched: CoreStateSlice = activePackageId
		? { ...active, systems: { ...active.systems, activePackageId } }
		: active;
	const started = accept(
		dispatch(switched, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Ogre', initiative: 12, maxHp: 30 }] },
		}),
	).nextState;
	return { state: started, env, ogreId: started.session.combat.order[0]! };
}

describe('RC-SYS-2.3 condition resolution against the active package', () => {
	it('resolves a 5e condition to the package label, icon and severity', () => {
		const poisoned = resolveCondition(DND5E_SYSTEM_PACKAGE, 'poisoned');
		expect(poisoned).toMatchObject({
			key: 'poisoned',
			label: 'Poisoned',
			icon: 'cond-poisoned',
			severity: 'major',
			known: true,
		});
		expect(isSystemCondition(DND5E_SYSTEM_PACKAGE, 'poisoned')).toBe(true);
	});

	it('gives every condition in a package a DISTINCT icon shape (the non-colour cue)', () => {
		for (const pkg of [DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE]) {
			const icons = systemConditionCatalog(pkg).map((c) => c.icon);
			expect(new Set(icons).size).toBe(icons.length);
		}
	});

	it('resolves a key the active package does not declare as honestly unknown, not as nothing', () => {
		const stray = resolveCondition(GENERIC_SYSTEM_PACKAGE, 'poisoned');
		expect(stray).toMatchObject({ key: 'poisoned', label: 'poisoned', icon: 'info', known: false });
		expect(isSystemCondition(GENERIC_SYSTEM_PACKAGE, 'poisoned')).toBe(false);
	});

	it('resolves a combatant’s stored keys in order, mixing known and leftover keys', () => {
		const resources = {
			hp: 1,
			maxHp: 1,
			tempHp: 0,
			conditions: ['hindered', 'poisoned'],
			deathSaves: { successes: 0, failures: 0, stable: false },
			concentration: { effect: null, since: null },
		};
		expect(
			resolveCombatantConditions(GENERIC_SYSTEM_PACKAGE, resources).map((c) => [c.label, c.known]),
		).toEqual([
			['Hindered', true],
			['poisoned', false],
		]);
	});
});

describe('RC-SYS-2.3 combat.apply-resource honours the package condition list', () => {
	it('adds a condition the active package declares and logs the package label', () => {
		const { state, env, ogreId } = runningCombat();
		const next = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'poisoned', present: true },
			}),
		).nextState;
		expect(next.session.combat.combatants[ogreId]!.resources.conditions).toEqual(['poisoned']);
		expect(next.session.combat.log.at(-1)!.label).toBe('Ogre: add Poisoned');
	});

	it('refuses a condition the active package does not declare (fail closed)', () => {
		const { state, env, ogreId } = runningCombat(GENERIC_SYSTEM_PACKAGE_ID);
		const result = rejected(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'poisoned', present: true },
			}),
		);
		expect(result.rejection.code).toBe('condition-not-in-system');
		// The Generic package's own condition still lands.
		const ok = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'hindered', present: true },
			}),
		).nextState;
		expect(ok.session.combat.combatants[ogreId]!.resources.conditions).toEqual(['hindered']);
	});

	it('still REMOVES a leftover key after a system switch, so nothing gets stuck on a combatant', () => {
		const { state, env, ogreId } = runningCombat();
		const poisoned = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'poisoned', present: true },
			}),
		).nextState;
		const generic: CoreStateSlice = {
			...poisoned,
			systems: { ...poisoned.systems, activePackageId: GENERIC_SYSTEM_PACKAGE_ID },
		};
		const cleared = accept(
			dispatch(generic, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'poisoned', present: false },
			}),
		).nextState;
		expect(cleared.session.combat.combatants[ogreId]!.resources.conditions).toEqual([]);
	});
});
