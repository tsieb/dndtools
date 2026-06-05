import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	advancementStateOf,
	dispatchCommand,
	resourcesOf,
	type Actor,
	type CharacterState,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function withActors(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

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

/** Quick-create a sidekick and return state + its id. */
function setupCharacter(
	env: CoreEnvironment,
	combat: Record<string, number> = { hp: 10, maxHp: 10, ac: 12 },
): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name: 'Pip', visibility: 'player-visible', combat },
		}),
	);
	return { state: created.nextState, characterId: firstCharacterId(created.nextState.characters) };
}

/** Grant a capability set to PLAYER_ACTOR on the character. */
function grant(
	state: CoreStateSlice,
	env: CoreEnvironment,
	characterId: string,
	capabilitySet: string,
	playerActorId = PLAYER_ACTOR.id,
): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: characterId, playerActorId, capabilitySet },
		}),
	).nextState;
}

/** Start an active session on a home scene so combat-resource updates are accepted. */
function startActiveSession(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	const home = accepted(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const sceneId = home.nextState.commandCenter.homeSceneId!;
	return accepted(
		dispatchCommand(home.nextState, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
}

// ================================================================================================
// CHAR-007 — combat resources during a session (owner / combat-participant / unauthorized)
// ================================================================================================

describe('CHAR-007 — combat-resource updates during a session', () => {
	it('AC1: a combat-participant may update HP while the session is active, and history records it', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env, { hp: 10, maxHp: 12, ac: 12 });
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		state = startActiveSession(state, env);

		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -4 },
			}),
		);
		const character = result.nextState.characters.characters[characterId]!;
		expect(character.combat.hp).toBe(6);
		// The expenditure history records the command (CHAR-008-style ledger; here for HP).
		const ledger = resourcesOf(character).ledger;
		expect(ledger).toHaveLength(1);
		expect(ledger[0]!.kind).toBe('hp');
		expect(ledger[0]!.delta).toBe(-4);
		expect(ledger[0]!.actorActorId).toBe(PLAYER_ACTOR.id);
		// A durable op was appended.
		expect(result.operationIds).toHaveLength(1);
		expect(result.events.some((e) => e.kind === 'character.resource-changed')).toBe(true);
	});

	it('AC1: the character owner may update combat resources (owner inherits combat-participant)', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		state = startActiveSession(state, env);

		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'condition', condition: 'prone', present: true },
			}),
		);
		expect(result.nextState.characters.characters[characterId]!.combat.conditions).toContain('prone');
	});

	it('AC2: the same player may NOT change the character name (combat-participant is not a sheet edit)', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		state = startActiveSession(state, env);

		// The name edit goes through the field-edit command, which requires `owner` — combat-participant
		// is rejected fail-closed (CHAR-007 AC2).
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.edit-field',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, path: 'name', value: 'Renamed' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('fails closed when the session is NOT active', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		// No active session.
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -1 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		// No mutation occurred.
		expect(result.nextState.characters.characters[characterId]!.combat.hp).toBe(10);
	});

	it('fails closed for an unauthorized player (neither owner nor combat-participant)', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = startActiveSession(state, env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id, // no grant
				payload: { characterId, kind: 'hp', delta: -1 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('fails closed for an observer even with the session active', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = startActiveSession(state, env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: OBSERVER_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -1 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('damage burns temporary HP before current HP', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env, { hp: 10, maxHp: 10, ac: 12 });
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		state = startActiveSession(state, env);

		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'temp-hp', value: 5 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -7 },
			}),
		).nextState;
		const character = state.characters.characters[characterId]!;
		expect(character.combat.tempHp).toBe(0);
		expect(character.combat.hp).toBe(8); // 5 absorbed, 2 to HP
	});

	it('death saves are bounded and stop at three', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		state = startActiveSession(state, env);

		for (let i = 0; i < 3; i += 1) {
			state = accepted(
				dispatchCommand(state, env, {
					type: 'character.update-combat-resource',
					actorId: PLAYER_ACTOR.id,
					payload: { characterId, kind: 'death-save', outcome: 'failure' },
				}),
			).nextState;
		}
		expect(resourcesOf(state.characters.characters[characterId]!).deathSaves.failures).toBe(3);
		// A fourth save is rejected fail-closed (already resolved).
		const fourth = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'death-save', outcome: 'failure' },
			}),
		);
		expect(fourth.rejection.code).toBe('invalid-state');
	});
});

// ================================================================================================
// CHAR-008 — structured spell/resource state, rest recovery, expenditure history
// ================================================================================================

describe('CHAR-008 — spells, slots, class resources, rest recovery, history', () => {
	it('AC1: casting a spell expends the appropriate slot and records the command on history', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		// The owner declares level-1 slots.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, level: 1, max: 2 },
			}),
		).nextState;
		state = startActiveSession(state, env);

		const cast = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'spell-slot', level: 1 },
			}),
		);
		const resources = resourcesOf(cast.nextState.characters.characters[characterId]!);
		expect(resources.spellSlots['1']!.expended).toBe(1);
		const lastEntry = resources.ledger[resources.ledger.length - 1]!;
		expect(lastEntry.kind).toBe('spell-slot');
		expect(lastEntry.delta).toBe(-1);
	});

	it('casting with no remaining slots is rejected fail-closed', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, level: 1, max: 1, expended: 1 },
			}),
		).nextState;
		state = startActiveSession(state, env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, kind: 'spell-slot', level: 1 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('AC2: a LONG rest deterministically restores spell slots, class resources, HP, and clears death saves', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env, { hp: 3, maxHp: 12, ac: 12 });
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		// Declare slots and a long-rest class resource, both partially expended.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, level: 1, max: 3, expended: 2 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-class-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, id: 'rage', name: 'Rage', max: 3, recharge: 'long', expended: 2 },
			}),
		).nextState;

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, rest: 'long' },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		const resources = resourcesOf(character);
		expect(resources.spellSlots['1']!.expended).toBe(0);
		expect(resources.classResources['rage']!.expended).toBe(0);
		expect(character.combat.hp).toBe(12); // restored to max
		expect(resources.deathSaves.failures).toBe(0);
		// Deterministic: running the same long rest from the same state yields the same result.
		const restedAgain = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, rest: 'long' },
			}),
		);
		expect(resourcesOf(restedAgain.nextState.characters.characters[characterId]!).spellSlots['1']!.expended).toBe(0);
	});

	it('AC2: a SHORT rest restores short-rest resources but NOT spell slots or long-rest resources', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env, { hp: 3, maxHp: 12, ac: 12 });
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, level: 1, max: 3, expended: 2 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-class-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, id: 'ki', name: 'Ki', max: 4, recharge: 'short', expended: 3 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-class-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, id: 'rage', name: 'Rage', max: 3, recharge: 'long', expended: 2 },
			}),
		).nextState;

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, rest: 'short' },
			}),
		);
		const resources = resourcesOf(rested.nextState.characters.characters[characterId]!);
		expect(resources.classResources['ki']!.expended).toBe(0); // short-rest resource recovered
		expect(resources.classResources['rage']!.expended).toBe(2); // long-rest resource untouched
		expect(resources.spellSlots['1']!.expended).toBe(2); // slots untouched on a short rest
		expect(rested.nextState.characters.characters[characterId]!.combat.hp).toBe(3); // HP untouched
	});

	it('managing spells/slots is OWNER-only (a combat-participant cannot manage structure)', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.set-spell-slots',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, level: 1, max: 2 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('manages prepared spells as structured state', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-spell',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, id: 'magic-missile', name: 'Magic Missile', level: 1, prepared: true },
			}),
		).nextState;
		const spells = resourcesOf(state.characters.characters[characterId]!).spells;
		expect(spells).toHaveLength(1);
		expect(spells[0]!.prepared).toBe(true);
	});
});

// ================================================================================================
// CHAR-009 — advancement (XP / milestone) with validation + no-partial-commit
// ================================================================================================

describe('CHAR-009 — level-up / advancement', () => {
	function setupOwnedL1(env: CoreEnvironment): { state: CoreStateSlice; characterId: string } {
		const __setup = setupCharacter(env, { hp: 8, maxHp: 8, ac: 12 });
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'owner');
		return { state, characterId };
	}

	it('AC1: invalid/incomplete choices block finalization and do NOT mutate the character (no-partial-commit)', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		// Milestone advancement skips the XP gate.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		// Set only the class (missing required hit points) — staged, not finalized.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Fighter' },
			}),
		).nextState;

		const beforeRevision = state.characters.characters[characterId]!.revision;
		const beforeMaxHp = state.characters.characters[characterId]!.combat.maxHp;

		const commit = rejected(
			dispatchCommand(state, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		expect(commit.rejection.code).toBe('draft-incomplete');
		expect(commit.rejection.issues?.some((i) => i.path === 'hitPointsGained')).toBe(true);
		// No partial mutation: level/maxHp/revision unchanged after the rejected commit.
		const after = commit.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(after).level).toBe(1);
		expect(after.combat.maxHp).toBe(beforeMaxHp);
		expect(after.revision).toBe(beforeRevision);
		// The staged draft is still present (not discarded by the failed commit).
		expect(advancementStateOf(after).draft).not.toBeNull();
	});

	it('finalizes a fully-valid milestone advancement, bumping level and max HP', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		const finalized = accepted(
			dispatchCommand(state, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		const character = finalized.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(character).level).toBe(2);
		expect(character.combat.maxHp).toBe(14); // 8 + 6
		// The staged draft is removed on commit.
		expect(advancementStateOf(character).draft).toBeNull();
		expect(finalized.events.some((e) => e.kind === 'character.advancement-finalized')).toBe(true);
	});

	it('XP-mode eligibility is gated: below threshold is rejected; at threshold is eligible', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		// Below the level-2 threshold (300 XP).
		const tooEarly = rejected(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'xp' },
			}),
		);
		expect(tooEarly.rejection.code).toBe('invalid-state');
		expect(advancementStateOf(tooEarly.nextState.characters.characters[characterId]!).draft).toBeNull();

		// Reach the threshold, then opening is eligible.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-xp',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, xp: 300 },
			}),
		).nextState;
		const opened = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'xp' },
			}),
		);
		expect(advancementStateOf(opened.nextState.characters.characters[characterId]!).draft).not.toBeNull();
	});

	it('AC3: a staged advancement persists with its validation state across a serialize/restore round-trip', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Fighter' }, // incomplete (no HP)
			}),
		).nextState;

		// Simulate an app restart by serializing and rehydrating the durable state.
		const restored = JSON.parse(JSON.stringify(state)) as CoreStateSlice;
		const restoredCharacter = restored.characters.characters[characterId]!;
		const advancement = advancementStateOf(restoredCharacter);
		expect(advancement.draft).not.toBeNull();
		expect(advancement.draft!.choices.className).toBe('Fighter');
		// The validation state recomputes identically from the restored draft (still incomplete).
		const commit = rejected(
			dispatchCommand(restored, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		expect(commit.rejection.code).toBe('draft-incomplete');
	});

	it('advancement is owner-only: a combat-participant cannot open it', () => {
		const env = makeEnvironment();
		const __setup = setupCharacter(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = grant(state, env, characterId, 'combat-participant');
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('requires a subclass at level 3', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		// Advance 1 -> 2 first.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		).nextState;
		// Now advance 2 -> 3, which requires a subclass.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		const missingSubclass = rejected(
			dispatchCommand(state, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		expect(missingSubclass.rejection.code).toBe('draft-incomplete');
		expect(missingSubclass.rejection.issues?.some((i) => i.path === 'subclass')).toBe(true);

		// Provide the subclass; commit succeeds and reaches level 3.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, subclass: 'Champion' },
			}),
		).nextState;
		const finalized = accepted(
			dispatchCommand(state, env, {
				type: 'character.commit-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		expect(advancementStateOf(finalized.nextState.characters.characters[characterId]!).level).toBe(3);
	});

	it('cancel discards the staged draft without changing level or XP', () => {
		const env = makeEnvironment();
		const __setup = setupOwnedL1(env);
		let state = __setup.state;
		const characterId = __setup.characterId;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		const cancelled = accepted(
			dispatchCommand(state, env, {
				type: 'character.cancel-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId },
			}),
		);
		const character = cancelled.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(character).draft).toBeNull();
		expect(advancementStateOf(character).level).toBe(1);
	});
});
