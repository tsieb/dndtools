import { dispatchCommand } from '../commands/dispatch';
import { buildContentItem } from '../state/content';
import { buildQuickCreatedCharacter } from '../state/character-state';
import { createOperationLog } from '../sync/operation-log';
import { buildInitialState, DM_ACTOR, PLAYER_ACTOR, makeEnvironment } from './fixtures';

export const LARGE_VAULT_COUNTS = { notes: 5_000, maps: 200, tiles: 60, characters: 40 } as const;
export const LARGE_VAULT_DATASET = '5,000 notes / 200 maps / 60 tiles / 40 characters';

/** A deterministic compacted snapshot, not a simulation of 5,000 command commits.
 * Linear construction keeps fixture setup out of the workflows being measured.
 * Every call owns its objects; no entropy, wall clock, network, or asset downloads.
 */
export function buildLargeVault() {
	const env = makeEnvironment();
	const now = '2026-06-03T12:00:00.000Z';
	let state = structuredClone(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
	const mapResult = dispatchCommand(state, env, {
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: {
			name: 'Perf map',
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	if (mapResult.status !== 'accepted') throw new Error(mapResult.rejection.message);
	const template = Object.values(mapResult.nextState.maps.maps)[0];
	if (!template) throw new Error('Map command did not create a map');
	for (let i = 0; i < LARGE_VAULT_COUNTS.maps; i++) {
		const id = `perf-map-${i}`;
		state.maps.maps[id] = {
			...structuredClone(template),
			id,
			name: `Perf map ${i}`,
			layers: template.layers.map((layer, j) => ({
				...structuredClone(layer),
				id: `${id}-layer-${j}`,
			})),
		};
	}
	const home = dispatchCommand(state, env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	});
	if (home.status !== 'accepted') throw new Error(home.rejection.message);
	state = home.nextState;
	const scene = state.scenes.scenes[state.commandCenter.homeSceneId!];
	if (!scene || scene.widgets.length === 0) throw new Error('Home scene has no tiles');
	const tiles = scene.widgets;
	scene.widgets = Array.from({ length: LARGE_VAULT_COUNTS.tiles }, (_, i) => {
		const widget = structuredClone(tiles[i % tiles.length]!);
		return {
			...widget,
			id: `perf-tile-${i}`,
			layout: { ...widget.layout, x: (i % 6) * 320, y: Math.floor(i / 6) * 240 },
		};
	});
	for (let i = 0; i < LARGE_VAULT_COUNTS.notes; i++) {
		const id = `perf-note-${i}`;
		state.content.items[id] = buildContentItem(
			{
				kind: 'note',
				title: `Perf note ${i}`,
				body: `Perf fixture note ${i}. See [[Perf note ${(i + 1) % LARGE_VAULT_COUNTS.notes}]] and [[Perf note ${(i + 7) % LARGE_VAULT_COUNTS.notes}]].`,
				visibility: i % 3 === 0 ? 'dm-only' : 'player-visible',
			},
			{ id, authorActorId: DM_ACTOR.id, now },
		);
	}
	for (let i = 0; i < LARGE_VAULT_COUNTS.characters; i++) {
		const id = `perf-character-${i}`;
		state.characters.characters[id] = buildQuickCreatedCharacter(
			{
				kind: 'npc',
				name: `Perf character ${i}`,
				visibility: 'player-visible',
				combat: { hp: 20 + i, maxHp: 20 + i, ac: 12 },
			},
			{ id, createdBy: DM_ACTOR.id, now, attackIds: env.ids },
		);
	}
	// The snapshot is authoritative: stale template operations must never replay over its tiles.
	state.sync = createOperationLog();
	// A bounded real delta above the compacted snapshot exercises sync hydration as well.
	for (let i = 0; i < 200; i++) {
		const itemId = `perf-note-${i}`;
		const result = dispatchCommand(state, env, {
			type: 'content.update-item',
			actorId: DM_ACTOR.id,
			payload: { itemId, body: `${state.content.items[itemId]!.body} Updated.` },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		state = result.nextState;
	}
	return state;
}
