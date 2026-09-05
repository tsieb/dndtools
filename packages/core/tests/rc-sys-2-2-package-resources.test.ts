import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	applyRest,
	applySceneRecovery,
	dispatchCommand,
	effectiveRecovery,
	recomputeResourceMaxima,
	recoversOnRest,
	resourceInstances,
	resourceMaxFromPackage,
	resourcesOf,
	spellSlotLevelOf,
	systemResourceFor,
	type CharacterState,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * RC-SYS-2.2 — spell slots and class resources are INSTANCES of the active package's `resources[]`,
 * and `character.rest` applies each resource's `recovery` band instead of a 5e literal.
 *
 * What these tests pin down: 5e ki / rage / spell slots recover exactly as they did before the
 * package drove them; a resource the package does not declare still honours its own stored
 * `recharge`; the Generic stress clock ticks during play and clears on scene end (and NOT on a
 * rest); a package resource's maximum comes from its `maxFormula` and follows the character up a
 * level; and instantiating a resource the active package does not declare fails closed.
 */

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function firstCharacterId(state: CharacterState): string {
	return Object.keys(state.characters)[0]!;
}

function setupCharacter(
	env: CoreEnvironment,
	combat: Record<string, number> = { hp: 10, maxHp: 10, ac: 12 },
): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name: 'Pip', visibility: 'player-visible', combat },
		}),
	);
	return { state: created.nextState, characterId: firstCharacterId(created.nextState.characters) };
}

/** CHAR-007 session-resource writes require an active session workflow. */
function startActiveSession(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	const home = accepted(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	return accepted(
		dispatchCommand(home.nextState, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.nextState.commandCenter.homeSceneId! },
		}),
	).nextState;
}

function selectGeneric(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'system.select',
			actorId: DM_ACTOR.id,
			payload: { packageId: GENERIC_SYSTEM_PACKAGE_ID, acknowledgeLoss: true },
		}),
	).nextState;
}

describe('RC-SYS-2.2 — recovery bands come from the package', () => {
	it('a 5e short-rest resource recovers on either rest; a long-rest resource only on a long rest', () => {
		expect(systemResourceFor(DND5E_SYSTEM_PACKAGE, 'ki')?.recovery).toBe('short');
		expect(systemResourceFor(DND5E_SYSTEM_PACKAGE, 'rage')?.recovery).toBe('long');
		expect(recoversOnRest('short', 'short')).toBe(true);
		expect(recoversOnRest('short', 'long')).toBe(true);
		expect(recoversOnRest('long', 'short')).toBe(false);
		expect(recoversOnRest('long', 'long')).toBe(true);
		expect(recoversOnRest('scene', 'long')).toBe(false);
		expect(recoversOnRest('never', 'long')).toBe(false);
	});

	it('a resource the package does not declare falls back to its own stored recharge', () => {
		expect(effectiveRecovery(DND5E_SYSTEM_PACKAGE, 'homebrewFocus', 'short')).toBe('short');
		expect(effectiveRecovery(DND5E_SYSTEM_PACKAGE, 'homebrewFocus', 'none')).toBe('never');
		// The package wins over a stale stored value when it DOES declare the key.
		expect(effectiveRecovery(DND5E_SYSTEM_PACKAGE, 'ki', 'long')).toBe('short');
		expect(effectiveRecovery(undefined, 'ki', 'long')).toBe('long');
	});

	it('AC1: under 5e, a short rest returns ki but not rage or spell slots', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env, { hp: 4, maxHp: 12, ac: 12 });
		let state = setup.state;
		const characterId = setup.characterId;
		for (const payload of [
			{ characterId, id: 'ki', name: 'Ki points', max: 4, recharge: 'long' as const, expended: 3 },
			{ characterId, id: 'rage', name: 'Rage', max: 3, recharge: 'short' as const, expended: 2 },
		]) {
			// Deliberately stored with the WRONG recharge: the package is the source of truth now.
			state = accepted(
				dispatchCommand(state, env, {
					type: 'character.set-class-resource',
					actorId: DM_ACTOR.id,
					payload,
				}),
			).nextState;
		}
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: DM_ACTOR.id,
				payload: { characterId, level: 1, max: 3, expended: 2 },
			}),
		).nextState;

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'short' },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		const resources = resourcesOf(character);
		expect(resources.classResources['ki']!.expended).toBe(0);
		expect(resources.classResources['rage']!.expended).toBe(2);
		expect(resources.spellSlots['1']!.expended).toBe(2);
		expect(character.combat.hp).toBe(4);
	});

	it('AC1: under 5e, a long rest returns ki, rage, spell slots and hit points', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env, { hp: 4, maxHp: 12, ac: 12 });
		let state = setup.state;
		const characterId = setup.characterId;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-class-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, id: 'rage', name: 'Rage', max: 3, recharge: 'long', expended: 3 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: DM_ACTOR.id,
				payload: { characterId, level: 2, max: 2, expended: 2 },
			}),
		).nextState;

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'long' },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		expect(resourcesOf(character).classResources['rage']!.expended).toBe(0);
		expect(resourcesOf(character).spellSlots['2']!.expended).toBe(0);
		expect(character.combat.hp).toBe(12);
	});
});

describe('RC-SYS-2.2 — the Generic stress clock', () => {
	it('AC2: ticks during play, survives a rest, and clears on scene end', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		let state = selectGeneric(setup.state, env);
		const characterId = setup.characterId;

		// The package declares the clock; the character instantiates it at the package's maximum.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-system-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, key: 'stress' },
			}),
		).nextState;
		const stress = resourcesOf(state.characters.characters[characterId]!).classResources['stress']!;
		expect(stress.name).toBe('Stress');
		expect(stress.max).toBe(6); // maxFormula '6'
		expect(stress.recharge).toBe('none'); // a `scene` resource never comes back on a rest

		state = startActiveSession(state, env);
		// Tick it twice.
		for (let i = 0; i < 2; i += 1) {
			state = accepted(
				dispatchCommand(state, env, {
					type: 'character.update-combat-resource',
					actorId: DM_ACTOR.id,
					payload: { characterId, kind: 'class-resource', resourceId: 'stress', amount: 1 },
				}),
			).nextState;
		}
		expect(
			resourcesOf(state.characters.characters[characterId]!).classResources['stress']!.expended,
		).toBe(2);

		// A long rest does NOT clear a scene-recovered resource.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'long' },
			}),
		).nextState;
		expect(
			resourcesOf(state.characters.characters[characterId]!).classResources['stress']!.expended,
		).toBe(2);

		// Ending the scene does.
		const ended = accepted(
			dispatchCommand(state, env, {
				type: 'character.recover-scene',
				actorId: DM_ACTOR.id,
				payload: { characterId },
			}),
		);
		const resources = resourcesOf(ended.nextState.characters.characters[characterId]!);
		expect(resources.classResources['stress']!.expended).toBe(0);
		const entry = resources.ledger[resources.ledger.length - 1]!;
		expect(entry.kind).toBe('scene');
		expect(entry.label).toBe('Scene end');
		expect(ended.events[0]).toMatchObject({ kind: 'character.scene-recovered', recovered: 1 });
	});

	it('scene end is accepted and honest under 5e, where nothing recovers on a scene', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		let state = setup.state;
		const characterId = setup.characterId;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-class-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, id: 'rage', name: 'Rage', max: 3, recharge: 'long', expended: 2 },
			}),
		).nextState;
		const ended = accepted(
			dispatchCommand(state, env, {
				type: 'character.recover-scene',
				actorId: DM_ACTOR.id,
				payload: { characterId },
			}),
		);
		const resources = resourcesOf(ended.nextState.characters.characters[characterId]!);
		expect(resources.classResources['rage']!.expended).toBe(2);
		expect(resources.ledger[resources.ledger.length - 1]!.delta).toBeNull();
		expect(ended.events[0]).toMatchObject({ kind: 'character.scene-recovered', recovered: 0 });
	});

	it('adding a resource the active package does not declare fails closed', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		const state = selectGeneric(setup.state, env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.add-system-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId: setup.characterId, key: 'ki' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.message).toContain('does not define a resource');
	});

	it('an observer may not add a system resource or end a scene', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		const state = selectGeneric(setup.state, env);
		for (const command of [
			{
				type: 'character.add-system-resource' as const,
				payload: { characterId: setup.characterId, key: 'stress' },
			},
			{ type: 'character.recover-scene' as const, payload: { characterId: setup.characterId } },
		]) {
			const result = rejected(
				dispatchCommand(state, env, { ...command, actorId: OBSERVER_ACTOR.id }),
			);
			expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});
});

describe('RC-SYS-2.2 — maxima come from the package formula', () => {
	it('a declarative maximum is read from the formula, and an unreadable one defers to the sheet', () => {
		const ki = systemResourceFor(DND5E_SYSTEM_PACKAGE, 'ki')!;
		expect(resourceMaxFromPackage(ki, { level: 5 })).toBe(5);
		expect(resourceMaxFromPackage(ki, { level: 1 })).toBe(0); // not online until level 2
		const slot = systemResourceFor(DND5E_SYSTEM_PACKAGE, 'spellSlot1')!;
		expect(slot.maxFormula).toBeNull();
		expect(resourceMaxFromPackage(slot, { level: 5 })).toBeNull();
		// A formula naming an input we cannot supply defers rather than zeroing the resource.
		const bardic = systemResourceFor(DND5E_SYSTEM_PACKAGE, 'bardicInspiration')!;
		expect(resourceMaxFromPackage(bardic, { level: 5 })).toBeNull();
		expect(spellSlotLevelOf('spellSlot9')).toBe(9);
		expect(spellSlotLevelOf('ki')).toBeNull();
	});

	it('a level-up recomputes the package-declared maxima and leaves the rest alone', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		const character = setup.state.characters.characters[setup.characterId]!;
		const before = resourcesOf({
			...character,
			resources: {
				...resourcesOf(character),
				classResources: {
					ki: { id: 'ki', name: 'Ki points', max: 2, expended: 2, recharge: 'short' },
					relic: { id: 'relic', name: 'Relic charge', max: 1, expended: 1, recharge: 'none' },
				},
			},
		});
		const after = recomputeResourceMaxima(before, DND5E_SYSTEM_PACKAGE, { level: 6 });
		expect(after.classResources['ki']!.max).toBe(6);
		expect(after.classResources['ki']!.expended).toBe(2);
		expect(after.classResources['relic']).toEqual(before.classResources['relic']);
		// Idempotent: recomputing at the same level hands back the very same object.
		expect(recomputeResourceMaxima(after, DND5E_SYSTEM_PACKAGE, { level: 6 })).toBe(after);
	});

	it('resourceInstances reports every package resource, present or not, plus homebrew', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		const character = setup.state.characters.characters[setup.characterId]!;
		const withResources = {
			...character,
			resources: {
				...resourcesOf(character),
				classResources: {
					stress: { id: 'stress', name: 'Stress', max: 6, expended: 4, recharge: 'none' as const },
					relic: {
						id: 'relic',
						name: 'Relic charge',
						max: 1,
						expended: 0,
						recharge: 'none' as const,
					},
				},
			},
		};
		const instances = resourceInstances(withResources, GENERIC_SYSTEM_PACKAGE);
		const stress = instances.find((instance) => instance.key === 'stress')!;
		expect(stress).toMatchObject({
			kind: 'track',
			recovery: 'scene',
			max: 6,
			available: 2,
			present: true,
		});
		expect(instances.find((instance) => instance.key === 'hp')!.present).toBe(false);
		// A resource the package never heard of is still reported, never dropped.
		expect(instances.find((instance) => instance.key === 'relic')!.present).toBe(true);
	});

	it('applyRest and applySceneRecovery are pure — the input resources are never mutated', () => {
		const env = makeEnvironment();
		const setup = setupCharacter(env);
		const character = setup.state.characters.characters[setup.characterId]!;
		const resources = {
			...resourcesOf(character),
			classResources: {
				stress: { id: 'stress', name: 'Stress', max: 6, expended: 3, recharge: 'none' as const },
			},
		};
		const meta = {
			ledgerId: 'ledger-1',
			now: '2026-01-01T00:00:00.000Z',
			actorActorId: DM_ACTOR.id,
			actorRole: DM_ACTOR.role,
			operationId: 'op-1',
		};
		const rested = applyRest(character, resources, 'long', meta, GENERIC_SYSTEM_PACKAGE);
		expect(rested.ok).toBe(true);
		const ended = applySceneRecovery(character, resources, GENERIC_SYSTEM_PACKAGE, meta);
		expect(ended.ok && ended.resources.classResources['stress']!.expended).toBe(0);
		expect(resources.classResources['stress']!.expended).toBe(3);
	});
});
