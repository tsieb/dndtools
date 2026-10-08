import { describe, expect, it } from 'vitest';
import {
	CHARACTER_ENTITY_TYPE,
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import { englishTranslate, resolveHomeSource } from './homeSources';

// RC-UX-6.2 — the hero reads one campaign name, and a party named in Settings › Players shows as
// avatars before anyone has a character.

function accept(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	const result = dispatchCommand(state, makeEnvironment(), command);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return result.nextState;
}

function resume(state: CoreStateSlice) {
	return resolveHomeSource(state, DM_ACTOR, 'resume', englishTranslate).rows;
}

describe('resume source', () => {
	it('heads the hero with the placeholder until the campaign is named, then with its name', () => {
		const start = buildInitialState(DM_ACTOR);
		expect(resume(start)[0]?.primary).toBe('Your campaign');
		const named = accept(start, {
			type: 'campaign.set-identity',
			actorId: DM_ACTOR.id,
			payload: { name: 'Lantern Coast' },
		});
		expect(resume(named)[0]?.primary).toBe('Lantern Coast');
	});

	it('lists the seated players with no character after the hero row, with their initials', () => {
		const state = accept(buildInitialState(DM_ACTOR, OBSERVER_ACTOR), {
			type: 'permission.add-players',
			actorId: DM_ACTOR.id,
			payload: { displayNames: ['Ada Quill', 'Brannoc'] },
		});
		const rows = resume(state);
		expect(rows).toHaveLength(3);
		expect(rows.slice(1).map((row) => [row.primary, row.avatar])).toEqual([
			['Ada Quill', 'AQ'],
			['Brannoc', 'B'],
		]);
		// The observer is not in the party; nor is the DM.
		expect(rows.map((row) => row.primary)).not.toContain(OBSERVER_ACTOR.displayName);
		expect(rows.map((row) => row.primary)).not.toContain(DM_ACTOR.displayName);
	});

	it('drops a player once they own a PC, which the party source draws instead', () => {
		const state = accept(buildInitialState(DM_ACTOR, PLAYER_ACTOR), {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'npc', name: 'Sera', visibility: 'shared' },
		});
		expect(
			resume(state)
				.slice(1)
				.map((row) => row.id),
		).toEqual([PLAYER_ACTOR.id]);
		const character = Object.values(state.characters.characters)[0]!;
		// Quick-create does not create PCs; the guided draft flow does, with an owner grant.
		character.kind = 'pc';
		state.permissions.grants = [
			...state.permissions.grants,
			{
				id: 'grant-owner',
				entityType: CHARACTER_ENTITY_TYPE,
				entityId: character.id,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
				createdBy: DM_ACTOR.id,
				createdAt: '2026-10-08T00:00:00.000Z',
			},
		];
		expect(resume(state)).toHaveLength(1);
	});
});
