import { describe, expect, it } from 'vitest';
import {
	PREVIEW_PLAYER_ACTOR_ID,
	dispatchCommand,
	permissionsWithPreviewActors,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { readPlayerPreview } from './playerPreview';

// RC-CAN-6.1 — the overlay's verdicts are the PREVIEWED actor's read. Every "hidden" below is one the
// DM's own read would not produce, which is what makes the model's actor the thing under test.

function build(sceneVisibility: 'player-visible' | 'dm-only' = 'player-visible') {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
		}
		state = result.nextState;
	};
	run({
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Harbor', description: '', visibility: sceneVisibility, tags: [] },
	});
	const sceneId = Object.keys(state.scenes.scenes)[0]!;
	run({
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'npc',
			name: 'Mira the Ferryman',
			visibility: 'dm-only',
			combat: { hp: 9, maxHp: 9, ac: 12 },
			attacks: [],
			data: {},
			dmOnlyFields: [],
		},
	});
	const npcId = Object.keys(state.characters.characters)[0]!;
	const add = (
		type: string,
		configuration: Record<string, unknown>,
		binding: { entityType: string; entityId: string } | null = null,
	) =>
		run({
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 240, h: 160 },
					configuration,
					localState: {},
					binding: binding ? { source: binding, mode: 'read', requiredCapability: 'viewer' } : null,
				},
			},
		});
	add('note', { visibility: 'player-visible', title: 'Notice' });
	add('note', { visibility: 'dm-only', title: 'Ambush' });
	add('character', { visibility: 'player-visible' }, { entityType: 'character', entityId: npcId });
	add('note', { title: 'No setting' });
	add('map', { visibility: 'player-visible' }, { entityType: 'map', entityId: 'map-elsewhere' });
	const ids = state.scenes.scenes[sceneId]!.widgets.map((w) => w.id);
	return { state, sceneId, ids };
}

/** What the runtime serves while previewing: the same state, with the reserved preview actors. */
function previewing(state: CoreStateSlice): CoreStateSlice {
	return { ...state, permissions: permissionsWithPreviewActors(state.permissions) };
}

describe('readPlayerPreview', () => {
	it('reads as the previewed actor: tile setting, bound DM-only content, fail-closed default', () => {
		const { state, sceneId, ids } = build();
		const [notice, ambush, npc, unset, map] = ids;
		const read = readPlayerPreview(previewing(state), PREVIEW_PLAYER_ACTOR_ID, sceneId);
		expect(read.actorId).toBe(PREVIEW_PLAYER_ACTOR_ID);
		expect(read.sceneDelivered).toBe(true);
		expect(read.tiles[notice!]).toMatchObject({ tone: 'visible', reason: 'visible' });
		expect(read.tiles[ambush!]).toMatchObject({ tone: 'hidden', reason: 'tileDmOnly' });
		// The core's binding resolver withholds a DM-only NPC from a player.
		expect(read.tiles[npc!]).toMatchObject({ tone: 'hidden', reason: 'bindingDmOnly' });
		// An unset visibility is DM only, as the header chip already says.
		expect(read.tiles[unset!]).toMatchObject({ tone: 'hidden', reason: 'tileDmOnly' });
		// A map binding is outside what the environment models — not falsely reported missing.
		expect(read.tiles[map!]?.reason).not.toBe('missing');
		expect(read.deliveredCount).toBe(2);
	});

	it('gives the DM a different answer for the same scene — the verdicts are actor-scoped', () => {
		const { state, sceneId, ids } = build();
		const dm = readPlayerPreview(state, DM_ACTOR.id, sceneId);
		for (const id of ids.slice(0, 4)) expect(dm.tiles[id]?.tone).toBe('visible');
	});

	it('honours a specific player with a real grant set', () => {
		const { state, sceneId, ids } = build();
		const read = readPlayerPreview(previewing(state), PLAYER_ACTOR.id, sceneId);
		expect(read.actorId).toBe(PLAYER_ACTOR.id);
		expect(read.tiles[ids[1]!]?.reason).toBe('tileDmOnly');
		expect(read.tiles[ids[2]!]?.reason).toBe('bindingDmOnly');
	});

	it('hides every tile with the scene reason when the actor cannot open the scene', () => {
		const { state, sceneId, ids } = build('dm-only');
		const read = readPlayerPreview(previewing(state), PREVIEW_PLAYER_ACTOR_ID, sceneId);
		expect(read.sceneDelivered).toBe(false);
		expect(read.deliveredCount).toBe(0);
		for (const id of ids)
			expect(read.tiles[id]).toMatchObject({ tone: 'hidden', reason: 'sceneDmOnly' });
	});

	it('reports a binding whose content was deleted as missing, not visible', () => {
		const { state, sceneId, ids } = build();
		const npcId = Object.keys(state.characters.characters)[0]!;
		const { [npcId]: _gone, ...rest } = state.characters.characters;
		const pruned = { ...state, characters: { ...state.characters, characters: rest } };
		const read = readPlayerPreview(previewing(pruned), PREVIEW_PLAYER_ACTOR_ID, sceneId);
		expect(read.tiles[ids[2]!]).toMatchObject({ tone: 'placeholder', reason: 'missing' });
	});
});
