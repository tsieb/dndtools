import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getPlayerViewSummary,
	getPlayerViewController,
	normalizeMapEntity,
	type CoreCommand,
	type Actor,
} from '../src';
import {
	buildInitialState,
	DM_ACTOR,
	PLAYER_ACTOR,
	OBSERVER_ACTOR,
	makeEnvironment,
} from '../src/testing/fixtures';

const OTHER: Actor = { id: 'other', role: 'player', displayName: 'Other player' };
const CO_DM: Actor = { id: 'co-dm', role: 'co-dm', displayName: 'Assistant GM' };

function fixture() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, CO_DM, PLAYER_ACTOR, OTHER, OBSERVER_ACTOR);
	function run(command: CoreCommand) {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		state = result.nextState;
	}
	function scene(name: string, visibility: 'dm-only' | 'player-visible') {
		run({ type: 'scene.create', actorId: DM_ACTOR.id, payload: { name, visibility } });
		return Object.values(state.scenes.scenes).find((s) => s.name === name)!.id;
	}
	function character(
		name: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
		kind: 'pc' | 'npc' = 'pc',
	) {
		run({
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility, kind: kind === 'pc' ? 'sidekick' : kind },
		});
		const record = Object.values(state.characters.characters).find((c) => c.name === name)!;
		// Sheet visibility fixture; PC creation itself is covered by the guided-draft tests.
		record.kind = kind;
		return record.id;
	}
	function rows(actorId = DM_ACTOR.id) {
		const result = getPlayerViewSummary(state, actorId);
		if (result.kind !== 'available') throw new Error(result.reason);
		return result.participants;
	}
	return {
		get state() {
			return state;
		},
		run,
		scene,
		character,
		rows,
	};
}

describe('RC-SES-7.3 player view summary', () => {
	it('matches the controller roster for DM and co-DM, including offline seats and observers', () => {
		const f = fixture();
		const controller = getPlayerViewController(f.state, DM_ACTOR.id);
		if (controller.kind !== 'available') throw new Error(controller.reason);
		expect(f.rows().map((p) => p.actorId)).toEqual(controller.participants.map((p) => p.actorId));
		expect(f.rows(CO_DM.id)).toEqual(f.rows());
		expect(f.rows().every((p) => p.connection === 'offline')).toBe(true);
		expect(f.rows(PLAYER_ACTOR.id).map((p) => p.actorId)).toEqual([PLAYER_ACTOR.id]);
		expect(f.rows(OBSERVER_ACTOR.id).map((p) => p.actorId)).toEqual([OBSERVER_ACTOR.id]);
		expect(getPlayerViewSummary(f.state, 'unknown')).toEqual({
			kind: 'denied',
			reason: 'unknown-actor',
		});
	});

	it('reports the stage after Start session without leaking unrelated private scenes', () => {
		const f = fixture();
		f.scene('SECRET GM PREP', 'dm-only');
		const id = f.scene('At the gates', 'player-visible');
		f.run({
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: id },
		});
		expect(f.rows().map((p) => p.stage)).toEqual(Array(3).fill({ id, name: 'At the gates' }));
		expect(JSON.stringify(f.rows(PLAYER_ACTOR.id))).not.toContain('SECRET');
		// A removed scene must not fall back to its saved authoring name.
		delete f.state.scenes.scenes[id];
		expect(f.rows().every((p) => p.stage === null)).toBe(true);
	});

	it('keeps another seat projection private and uses live presence rather than saved delivery', () => {
		const f = fixture();
		const id = f.scene('Other seat secret', 'dm-only');
		f.run({
			type: 'session.project-player-view',
			actorId: DM_ACTOR.id,
			payload: {
				playerActorIds: [OTHER.id],
				connectionState: 'connected',
				target: {
					kind: 'scene',
					sceneId: id,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		});
		expect(f.rows().find((p) => p.actorId === OTHER.id)).toMatchObject({
			connection: 'offline',
			stage: { id, name: 'Other seat secret' },
		});
		expect(JSON.stringify(f.rows(PLAYER_ACTOR.id))).not.toContain('Other seat secret');
		f.state.presence = {
			schemaVersion: 1,
			entries: {
				[OTHER.id]: {
					actorId: OTHER.id,
					status: 'away',
					device: 'mobile',
					updatedAt: '2026-10-12T00:00:00Z',
				},
			},
		};
		expect(f.rows().find((p) => p.actorId === OTHER.id)?.connection).toBe('away');
	});

	// The companion's Handouts page lists the content items revealed to its seat; the row counts the
	// same read, so the GM's number is the player's. A DM-only note is never counted (or named).
	it('counts the handouts each companion lists and follows a visibility change', () => {
		const f = fixture();
		const create = (
			title: string,
			visibility: 'dm-only' | 'player-visible' | 'shared',
			sharedWith: string[] = [],
		) =>
			f.run({
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title, body: '', visibility, sharedWith },
			});
		create('SECRET plot note', 'dm-only');
		create('Town notice', 'player-visible');
		create('Letter for one seat', 'shared', [PLAYER_ACTOR.id]);
		expect(f.rows(PLAYER_ACTOR.id)[0]?.handoutCount).toBe(2);
		expect(f.rows().find((p) => p.actorId === OTHER.id)?.handoutCount).toBe(1);
		expect(f.rows(OTHER.id)[0]?.handoutCount).toBe(1);
		expect(JSON.stringify(f.rows())).not.toContain('SECRET');
		const notice = Object.values(f.state.content.items).find((i) => i.title === 'Town notice')!;
		f.run({
			type: 'content.set-item-visibility',
			actorId: DM_ACTOR.id,
			payload: { itemId: notice.id, visibility: 'dm-only' },
		});
		expect(f.rows(PLAYER_ACTOR.id)[0]?.handoutCount).toBe(1);
		expect(f.rows(OTHER.id)[0]?.handoutCount).toBe(0);
	});

	it('lists full PC sheets through sharing and grants, excluding public-only PCs and NPCs', () => {
		const f = fixture();
		f.character('SECRET PC', 'dm-only');
		f.character('Public NPC', 'player-visible', 'npc');
		f.character('Other seat PC', 'shared');
		const publicId = f.character('Public sheet', 'player-visible');
		const grantedId = f.character('Granted sheet', 'shared');
		f.run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: grantedId,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'viewer',
			},
		});
		expect(f.rows(PLAYER_ACTOR.id)[0]?.characters).toEqual([
			{ id: grantedId, name: 'Granted sheet' },
			{ id: publicId, name: 'Public sheet' },
		]);
		expect(f.rows(OTHER.id)[0]?.characters).toEqual([{ id: publicId, name: 'Public sheet' }]);
		expect(f.rows(OBSERVER_ACTOR.id)[0]?.characters).toEqual([]);
		expect(JSON.stringify(f.rows())).not.toContain('SECRET');
	});

	it('reports only a delivered, actor-visible map and drops unavailable map names', () => {
		const f = fixture();
		f.state.maps.maps['map'] = normalizeMapEntity({
			id: 'map',
			name: 'Table map',
			visibility: 'shared',
			description: '',
			layers: [],
			regions: [],
			defaultRegionId: null,
			updatedAt: '2026-10-12T00:00:00Z',
			revision: 1,
		});
		expect(f.rows(PLAYER_ACTOR.id)[0]?.projectedMap).toBeNull();
		f.run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
		f.run({ type: 'session.set-active-map', actorId: DM_ACTOR.id, payload: { mapId: 'map' } });
		f.run({
			type: 'session.project-active-map',
			actorId: DM_ACTOR.id,
			payload: { playerActorIds: [PLAYER_ACTOR.id] },
		});
		expect(f.rows(PLAYER_ACTOR.id)[0]?.projectedMap).toEqual({ id: 'map', name: 'Table map' });
		expect(f.rows(OTHER.id)[0]?.projectedMap).toBeNull();
		f.state.maps.maps['map']!.visibility = 'dm-only';
		f.state.maps.maps['map']!.name = 'SECRET MAP';
		expect(f.rows(PLAYER_ACTOR.id)[0]?.projectedMap).toBeNull();
		expect(JSON.stringify(f.rows())).not.toContain('SECRET MAP');
		delete f.state.maps.maps['map'];
		expect(f.rows(PLAYER_ACTOR.id)[0]?.projectedMap).toBeNull();
	});
});
