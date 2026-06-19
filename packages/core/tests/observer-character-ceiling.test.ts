import { describe, expect, it } from 'vitest';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	dispatchCommand,
	getCharacterForActor,
	type CommandResult,
	type CoreStateSlice,
} from '../src';

/**
 * CHAR-015 / base-roles observer ceiling (`canReadCharacterData: false`): an observer NEVER reads
 * character data — not even a `shared` character whose `sharedWith` it was (erroneously) added to. The
 * party overview enforced this ceiling, but the single-character read (getCharacterForActor, via
 * characterVisibleToActor) did not — an observer in `sharedWith` could read the character. Fixed fail
 * closed; a player in `sharedWith` still reads it (control).
 */

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${result.rejection.message}`);
	return result;
}

/** Quick-create a `shared` character, then place `sharedWith` ids on it directly (no command path adds observers). */
function sharedCharacterWith(sharedWith: string[]): { state: CoreStateSlice; characterId: string } {
	const env = makeEnvironment();
	const created = accepted(
		dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'npc', name: 'Courtier', visibility: 'shared' },
		}),
	);
	const characterId = Object.keys(created.nextState.characters.characters)[0]!;
	const character = created.nextState.characters.characters[characterId]!;
	const state: CoreStateSlice = {
		...created.nextState,
		characters: {
			...created.nextState.characters,
			characters: { ...created.nextState.characters.characters, [characterId]: { ...character, sharedWith } },
		},
	};
	return { state, characterId };
}

describe('observer ceiling — an observer never reads a shared character', () => {
	it('returns null for an observer even when it is in the character sharedWith', () => {
		const { state, characterId } = sharedCharacterWith([OBSERVER_ACTOR.id]);
		expect(getCharacterForActor(state.characters, state.permissions, OBSERVER_ACTOR.id, characterId)).toBeNull();
	});

	it('still returns the character for a player in sharedWith (control)', () => {
		const { state, characterId } = sharedCharacterWith([PLAYER_ACTOR.id]);
		expect(getCharacterForActor(state.characters, state.permissions, PLAYER_ACTOR.id, characterId)).not.toBeNull();
	});
});
