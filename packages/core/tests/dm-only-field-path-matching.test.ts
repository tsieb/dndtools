import { describe, expect, it } from 'vitest';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	dispatchCommand,
	getCharacterForActor,
	getCollaborativeCharacterView,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * CHAR-010 / CHAR-014 — a DM-only character field MUST be hidden from (and unwritable by) a non-DM in
 * EVERY addressable form of its path. `Character.dmOnlyFields` may declare a field either namespaced
 * (`data.dmNotes`) or as a bare legacy/schema key (`dmNotes` — e.g. vault-object schema fields, or a
 * CHAR-001 quick-create payload). The plain redactor already normalizes both forms, but the
 * collaborative read view (`fieldVisibleToActor`) and the field-edit write command did an exact
 * `dmOnlyFields.includes(path)` against the always-namespaced `data.<key>` path — so a BARE-declared
 * dm-only field leaked to / was writable by a non-DM. These tests pin both directions with bare form.
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

/** DM quick-creates a player-visible NPC with a BARE-declared dm-only field + grants the player owner. */
function setup(env: CoreEnvironment): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'npc',
				name: 'Villain',
				visibility: 'player-visible',
				data: { dmNotes: 'the secret twist' },
				dmOnlyFields: ['dmNotes'], // BARE form — not `data.dmNotes`
			},
		}),
	);
	const characterId = Object.keys(created.nextState.characters.characters)[0]!;
	const granted = accepted(
		dispatchCommand(created.nextState, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: characterId, playerActorId: PLAYER_ACTOR.id, capabilitySet: 'owner' },
		}),
	);
	return { state: granted.nextState, characterId };
}

describe('CHAR-010/014 — a bare-declared dm-only field is hidden + unwritable in every form', () => {
	it('the plain character redactor hides the bare dm-only field (reference path)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setup(env);
		const view = getCharacterForActor(state.characters, state.permissions, PLAYER_ACTOR.id, characterId)!;
		expect(view.data.dmNotes).toBeUndefined();
	});

	it('the collaborative view does not leak the bare dm-only field to a non-DM (read)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setup(env);
		const playerView = getCollaborativeCharacterView(
			state.characters,
			state.permissions,
			PLAYER_ACTOR.id,
			characterId,
		)!;
		expect(playerView.fields.find((f) => f.path === 'data.dmNotes')).toBeUndefined();
		// The DM still sees it (the field is not lost, only withheld from the non-DM).
		const dmView = getCollaborativeCharacterView(state.characters, state.permissions, DM_ACTOR.id, characterId)!;
		expect(dmView.fields.find((f) => f.path === 'data.dmNotes')?.value).toBe('the secret twist');
	});

	it('a non-DM owner cannot write the bare dm-only field via its namespaced path (write)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setup(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.edit-field',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, path: 'data.dmNotes', value: 'hacked' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.characters.characters[characterId]!.data.dmNotes).toBe('the secret twist');
	});
});
