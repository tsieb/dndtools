import { describe, expect, it } from 'vitest';
import {
	auditEntityPermissionConsistency,
	dispatchCommand,
	getCharacterForActor,
	getCollaborativeCharacterView,
	hasGrantedCapability,
	requiredCapabilityForCharacterField,
	isBackstoryEditorField,
	BACKSTORY_EDITOR_DATA_KEYS,
	type Actor,
	type CommandResult,
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
 * CHAR-003 / CHAR-010 — Ownership and permission grants for the CHAR domain.
 *
 * This epic is COMPOSITION of the PERM grant/transfer machinery (singular ownership + atomic
 * transfer + capability-set schema + inheritance + visibility-filter) with the CHAR field-edit
 * authority. The tests assert:
 *
 *   CHAR-003 — the DM assigns EXACTLY ONE `owner` to a player; granting `owner` does NOT remove the
 *   DM's full administrative authority (the DM still edits every field, including DM-only, after the
 *   grant); a second `owner` is an invalid state the audit flags; transfer is atomic (never zero or
 *   two owners).
 *
 *   CHAR-010 — a `backstory-editor` (and an `owner`, which inherits it) may edit ONLY the narrative
 *   field surface; a combat/identity field edit by a backstory-editor is rejected fail-closed; a
 *   backstory-editor may NOT read or write a DM-only field and its value never appears in their view.
 */

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

function firstCharacterId(state: CoreStateSlice): string {
	return Object.keys(state.characters.characters)[0]!;
}

/**
 * A player-visible character with a narrative field (`data.backstory`), a combat field, and a
 * declared DM-only field (`data.dmNotes`). No grants yet. Returns the seeded state + character id.
 */
function createCharacter(env: CoreEnvironment): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name: 'Pip',
				visibility: 'player-visible',
				combat: { hp: 10, maxHp: 10, ac: 12 },
				data: { backstory: 'A humble origin.', dmNotes: 'secret twist' },
				dmOnlyFields: ['data.dmNotes'],
			},
		}),
	);
	return { state: created.nextState, characterId: firstCharacterId(created.nextState) };
}

function grant(
	state: CoreStateSlice,
	env: CoreEnvironment,
	characterId: string,
	playerActorId: string,
	capabilitySet: string,
	actorId = DM_ACTOR.id,
): CommandResult {
	return dispatchCommand(state, env, {
		type: 'permission.grant-capability-set',
		actorId,
		payload: { entityType: 'character', entityId: characterId, playerActorId, capabilitySet },
	});
}

function editField(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	characterId: string,
	path: string,
	value: unknown,
): CommandResult {
	return dispatchCommand(state, env, {
		type: 'character.edit-field',
		actorId,
		payload: { characterId, path, value },
	});
}

// --- CHAR-003 — singular owner + DM retains full administrative authority -----------------------

describe('CHAR-003 — the DM assigns exactly one owner while retaining full DM authority', () => {
	it('AC1: granting `owner` to a player confers owner-inherited permissions on the character', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);

		const result = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner'));
		const owner = result.nextState.permissions.actors[PLAYER_ACTOR.id]!;

		// Owner inherits combat-participant, backstory-editor, and viewer (PERM-006 inheritance).
		for (const set of ['owner', 'combat-participant', 'backstory-editor', 'viewer'] as const) {
			expect(
				hasGrantedCapability(result.nextState.permissions, owner, 'character', characterId, set),
			).toBe(true);
		}
		// Exactly one owner grant exists.
		const owners = result.nextState.permissions.grants.filter(
			(g) => g.entityId === characterId && g.capabilitySet === 'owner',
		);
		expect(owners).toHaveLength(1);
		expect(owners[0]!.playerActorId).toBe(PLAYER_ACTOR.id);
		// A durable grant op was appended (routed through the op-log, not direct storage).
		expect(result.operationIds).toHaveLength(1);
	});

	it('the owner grant is SINGULAR — a clean state never has two distinct owners', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const owned = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner'));

		// The audit sees exactly one owner and reports no multiple-owner problem.
		const report = auditEntityPermissionConsistency(owned.nextState.permissions, {
			entities: [
				{ entityType: 'character', entityId: characterId, visibility: 'player-visible' },
			],
		});
		expect(report.problems.some((p) => p.kind === 'multiple-character-owners')).toBe(false);
	});

	it('AC2: granting `owner` to a second player is REJECTED — must use transfer-ownership instead', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const first = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner'));

		// Attempting to grant `owner` to a different player while one already holds it is rejected.
		const second = rejected(grant(first.nextState, env, characterId, PLAYER_B.id, 'owner'));
		expect(second.rejection.code).toBe('invalid-payload');
		expect(second.rejection.message).toMatch(/already has an owner/i);

		// The state is unchanged — still exactly one owner (the original grantee).
		const owners = first.nextState.permissions.grants.filter(
			(g) => g.entityId === characterId && g.capabilitySet === 'owner',
		);
		expect(owners).toHaveLength(1);
		expect(owners[0]!.playerActorId).toBe(PLAYER_ACTOR.id);
	});

	it('DM-RETAINS-ADMIN: after granting `owner` to a player, the DM still edits EVERY field', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const owned = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner')).nextState;

		// The DM edits a narrative field, a combat field, AND the DM-only field — all accepted.
		const narrative = accepted(
			editField(owned, env, DM_ACTOR.id, characterId, 'data.backstory', 'DM-revised origin.'),
		).nextState;
		const combat = accepted(
			editField(narrative, env, DM_ACTOR.id, characterId, 'combat.hp', 7),
		).nextState;
		const dmOnly = accepted(
			editField(combat, env, DM_ACTOR.id, characterId, 'data.dmNotes', 'updated secret'),
		).nextState;

		const character = dmOnly.characters.characters[characterId]!;
		expect(character.data['backstory']).toBe('DM-revised origin.');
		expect(character.combat.hp).toBe(7);
		expect(character.data['dmNotes']).toBe('updated secret');
		// The DM's authority is NOT gated by any grant record — it is the inherent role floor.
		expect(character.collaboration!.fieldAuthors['data.dmNotes']!.authorRole).toBe('dm');
	});

	it('AC2/transfer: ownership transfer atomically revokes the prior owner — never two owners', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const owned = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner')).nextState;

		const transferred = accepted(
			dispatchCommand(owned, env, {
				type: 'permission.transfer-ownership',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, toPlayerActorId: PLAYER_B.id },
			}),
		).nextState;

		const owners = transferred.permissions.grants.filter(
			(g) => g.entityId === characterId && g.capabilitySet === 'owner',
		);
		expect(owners).toHaveLength(1);
		expect(owners[0]!.playerActorId).toBe(PLAYER_B.id);
		// Prior owner lost ownership; new owner holds it. No window with zero or two owners.
		expect(
			hasGrantedCapability(transferred.permissions, PLAYER_ACTOR, 'character', characterId, 'owner'),
		).toBe(false);
		expect(
			hasGrantedCapability(transferred.permissions, PLAYER_B, 'character', characterId, 'owner'),
		).toBe(true);
		// The DM STILL edits everything after the transfer (administrative floor unchanged).
		const afterTransfer = accepted(
			editField(transferred, env, DM_ACTOR.id, characterId, 'data.dmNotes', 'post-transfer secret'),
		).nextState;
		expect(afterTransfer.characters.characters[characterId]!.data['dmNotes']).toBe(
			'post-transfer secret',
		);
	});

	it('granting `owner` is DM-authored only — a player granting themselves is rejected fail-closed', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const result = rejected(
			grant(state, env, characterId, PLAYER_ACTOR.id, 'owner', PLAYER_ACTOR.id),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

// --- CHAR-010 — backstory-editor field-scope + DM-only non-leak ---------------------------------

describe('CHAR-010 — backstory-editor field-scoped editing without DM-only access', () => {
	it('field-authority policy maps narrative→backstory-editor, combat→combat-participant, else→owner', () => {
		expect(requiredCapabilityForCharacterField('data.backstory')).toBe('backstory-editor');
		expect(requiredCapabilityForCharacterField('data.relationships')).toBe('backstory-editor');
		expect(requiredCapabilityForCharacterField('data.playerNotes')).toBe('backstory-editor');
		expect(requiredCapabilityForCharacterField('combat.hp')).toBe('combat-participant');
		expect(requiredCapabilityForCharacterField('combat.conditions')).toBe('combat-participant');
		// Identity + unmapped data keys fail closed to owner (narrowest set covering all fields).
		expect(requiredCapabilityForCharacterField('name')).toBe('owner');
		expect(requiredCapabilityForCharacterField('data.dmNotes')).toBe('owner');
		expect(requiredCapabilityForCharacterField('data.somethingArbitrary')).toBe('owner');
		// Every declared narrative key is recognized as a backstory-editor field.
		for (const key of BACKSTORY_EDITOR_DATA_KEYS) {
			expect(isBackstoryEditorField(`data.${key}`)).toBe(true);
		}
		expect(isBackstoryEditorField('combat.hp')).toBe(false);
	});

	it('AC1: a backstory-editor may edit a narrative (relationships) field — accepted', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const granted = accepted(
			grant(state, env, characterId, PLAYER_ACTOR.id, 'backstory-editor'),
		).nextState;

		const edited = accepted(
			editField(granted, env, PLAYER_ACTOR.id, characterId, 'data.relationships', 'Sworn ally of the duke.'),
		).nextState;
		const character = edited.characters.characters[characterId]!;
		expect(character.data['relationships']).toBe('Sworn ally of the duke.');
		// Attributed to the player who authored it.
		expect(character.collaboration!.fieldAuthors['data.relationships']!.authorActorId).toBe(
			PLAYER_ACTOR.id,
		);
	});

	it('a backstory-editor may edit EVERY narrative field but NOTHING outside the narrative surface', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		let s = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'backstory-editor')).nextState;

		// All narrative fields succeed.
		for (const key of BACKSTORY_EDITOR_DATA_KEYS) {
			s = accepted(
				editField(s, env, PLAYER_ACTOR.id, characterId, `data.${key}`, `value for ${key}`),
			).nextState;
			expect(s.characters.characters[characterId]!.data[key]).toBe(`value for ${key}`);
		}

		// A COMBAT field is outside the narrative scope ⇒ rejected fail-closed.
		const combatReject = rejected(editField(s, env, PLAYER_ACTOR.id, characterId, 'combat.hp', 1));
		expect(combatReject.rejection.code).toBe('actor-not-authorized');
		expect(s.characters.characters[characterId]!.combat.hp).toBe(10); // unchanged

		// An IDENTITY field (name) requires owner ⇒ rejected fail-closed.
		const nameReject = rejected(editField(s, env, PLAYER_ACTOR.id, characterId, 'name', 'Renamed'));
		expect(nameReject.rejection.code).toBe('actor-not-authorized');
		expect(s.characters.characters[characterId]!.name).toBe('Pip'); // unchanged
	});

	it('AC2/non-leak: a backstory-editor may NOT write the DM-only field, and it is absent from their view', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const granted = accepted(
			grant(state, env, characterId, PLAYER_ACTOR.id, 'backstory-editor'),
		).nextState;

		// Writing the DM-only field is rejected — even though it is a `data.*` key.
		const writeReject = rejected(
			editField(granted, env, PLAYER_ACTOR.id, characterId, 'data.dmNotes', 'leak attempt'),
		);
		expect(writeReject.rejection.code).toBe('actor-not-authorized');
		// The canonical DM-only value is unchanged (no overwrite).
		expect(granted.characters.characters[characterId]!.data['dmNotes']).toBe('secret twist');

		// The DM-only field's VALUE never appears in the backstory-editor's read views.
		const view = getCharacterForActor(
			granted.characters,
			granted.permissions,
			PLAYER_ACTOR.id,
			characterId,
		);
		expect(view).not.toBeNull();
		expect('dmNotes' in (view!.data as Record<string, unknown>)).toBe(false);

		const collab = getCollaborativeCharacterView(
			granted.characters,
			granted.permissions,
			PLAYER_ACTOR.id,
			characterId,
		);
		expect(collab).not.toBeNull();
		// No field/history entry references the DM-only path for the non-DM actor (non-leak).
		expect(collab!.fields.some((f) => f.path === 'data.dmNotes')).toBe(false);
		expect(collab!.history.some((h) => h.path === 'data.dmNotes')).toBe(false);
		// The DM-only value string is not present anywhere in the serialized non-DM view.
		expect(JSON.stringify(collab)).not.toContain('secret twist');
		expect(JSON.stringify(collab)).not.toContain('dmNotes');
	});

	it('the DM-only rejection is INDISTINGUISHABLE for an existing vs non-existent DM-only field', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const granted = accepted(
			grant(state, env, characterId, PLAYER_ACTOR.id, 'backstory-editor'),
		).nextState;

		// The DM-only data.dmNotes exists; a combat field requires a capability they lack. Both rejected
		// with the same generic field-level message, so the rejection does not confirm field existence.
		const dmOnly = rejected(
			editField(granted, env, PLAYER_ACTOR.id, characterId, 'data.dmNotes', 'x'),
		);
		const combat = rejected(editField(granted, env, PLAYER_ACTOR.id, characterId, 'combat.ac', 99));
		expect(dmOnly.rejection.message).toBe(combat.rejection.message);
		expect(dmOnly.rejection.message).toMatch(/do not have permission to edit this field/i);
	});

	it('an OWNER (inherits backstory-editor) may edit narrative AND combat AND identity fields', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);
		const owned = accepted(grant(state, env, characterId, PLAYER_ACTOR.id, 'owner')).nextState;

		const narrative = accepted(
			editField(owned, env, PLAYER_ACTOR.id, characterId, 'data.bonds', 'Bound to the order.'),
		).nextState;
		const combat = accepted(
			editField(narrative, env, PLAYER_ACTOR.id, characterId, 'combat.hp', 8),
		).nextState;
		const identity = accepted(
			editField(combat, env, PLAYER_ACTOR.id, characterId, 'name', 'Pip the Bold'),
		).nextState;
		const character = identity.characters.characters[characterId]!;
		expect(character.data['bonds']).toBe('Bound to the order.');
		expect(character.combat.hp).toBe(8);
		expect(character.name).toBe('Pip the Bold');
		// But even an owner may NOT write the DM-only field (fail closed — Contract 3 field visibility).
		const dmOnlyReject = rejected(
			editField(identity, env, PLAYER_ACTOR.id, characterId, 'data.dmNotes', 'nope'),
		);
		expect(dmOnlyReject.rejection.code).toBe('actor-not-authorized');
	});

	it('an actor with NO grant (and an observer) cannot edit any field — fail closed', () => {
		const env = makeEnvironment();
		const { state, characterId } = createCharacter(env);

		// A player with no grant on this character.
		const noGrant = rejected(
			editField(state, env, PLAYER_B.id, characterId, 'data.backstory', 'unauthorized'),
		);
		expect(noGrant.rejection.code).toBe('actor-not-authorized');

		// An observer even with a (would-be-dropped) grant cannot edit; the grant command rejects the
		// observer grant outright, so the observer simply has no capability and the edit is rejected.
		const observerEdit = rejected(
			editField(state, env, OBSERVER_ACTOR.id, characterId, 'data.backstory', 'unauthorized'),
		);
		expect(observerEdit.rejection.code).toBe('actor-not-authorized');
	});

	it('an expired backstory-editor grant is inert — the narrative edit is rejected fail-closed', () => {
		const env = makeEnvironment({ clock: () => '2026-06-04T12:00:00.000Z' });
		const { state, characterId } = createCharacter(env);
		const granted = accepted(
			dispatchCommand(state, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'backstory-editor',
					expiresAt: '2026-06-04T13:00:00.000Z',
				},
			}),
		).nextState;

		// After expiry the grant confers nothing, so the narrative edit is rejected. (The clock advances
		// per call; by the time the edit dispatches, the env clock is well past the expiry.)
		const afterExpiryEnv = makeEnvironment({ clock: () => '2026-06-04T14:00:00.000Z' });
		const expiredEdit = rejected(
			editField(granted, afterExpiryEnv, PLAYER_ACTOR.id, characterId, 'data.backstory', 'late'),
		);
		expect(expiredEdit.rejection.code).toBe('actor-not-authorized');
	});
});
