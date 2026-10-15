import { dispatchCommand } from '../commands/dispatch';
import type { CoreCommand, CoreStateSlice } from '../commands/types';
import { buildContentItem } from '../state/content';
import { buildQuickCreatedCharacter } from '../state/character-state';
import { createOperationLog } from '../sync/operation-log';
import { buildInitialState, DM_ACTOR, PLAYER_ACTOR, makeEnvironment } from './fixtures';

export const LARGE_VAULT_COUNTS = { notes: 5_000, maps: 200, tiles: 60, characters: 40 } as const;
export const LARGE_VAULT_DATASET = '5,000 notes / 200 maps / 60 tiles / 40 characters';

/** One of the 200 maps carries the map pan/zoom budget's declared dataset (4 layers / 100 POIs), so
 * the large map scenario opens it straight from the snapshot instead of committing 101 commands
 * through the storage boundary of a 5,000-note vault.
 */
export const LARGE_VAULT_PAN_ZOOM_MAP = {
	name: 'Perf pan-zoom map',
	layers: 4,
	pois: 100,
} as const;

/** Note edits committed above the compacted snapshot, so storage hydration replays a real delta. */
export const LARGE_VAULT_NOTE_EDITS = 100;

/** The note title the search, graph and link fixtures share with the standard vault. */
export function largeVaultNoteTitle(index: number): string {
	return `Perf note ${index}`;
}

function accept(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	command: CoreCommand,
) {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return result.nextState;
}

/** A deterministic compacted snapshot, not a simulation of 5,000 command commits.
 * Linear construction keeps fixture setup out of the workflows being measured.
 * Every call owns its objects; no entropy, wall clock, network, or asset downloads.
 *
 * Ids and note bodies are deliberately short. The durable state crosses the storage boundary's
 * 5 MiB cap on every commit, and the pinned CI reference revision sends the previous AND next state
 * across it, so it pays twice the vault's size. `tests/perf/large-vault.test.ts` fails if a scenario's
 * commit on either boundary shape loses its headroom.
 */
export function buildLargeVault(): CoreStateSlice {
	const env = makeEnvironment();
	const now = '2026-06-03T12:00:00.000Z';
	let state = structuredClone(buildInitialState(DM_ACTOR, PLAYER_ACTOR));

	// The pan/zoom map is built by the same commands the standard map scenario dispatches.
	const panZoom = accept(structuredClone(state), env, {
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: {
			name: LARGE_VAULT_PAN_ZOOM_MAP.name,
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [
				{ name: 'Base', category: 'base', visibility: 'dm-only' },
				{ name: 'Terrain', category: 'terrain', visibility: 'dm-only' },
				{ name: 'Roads', category: 'roads', visibility: 'dm-only' },
				{ name: 'Points of interest', category: 'poi', visibility: 'dm-only' },
			],
		},
	});
	const panZoomMapId = Object.keys(panZoom.maps.maps).find(
		(id) => panZoom.maps.maps[id]!.name === LARGE_VAULT_PAN_ZOOM_MAP.name,
	);
	if (!panZoomMapId) throw new Error('Map command did not create the pan/zoom map');
	const layerIds = panZoom.maps.maps[panZoomMapId]!.layers.map((layer) => layer.id);
	let withPois = panZoom;
	for (let i = 0; i < LARGE_VAULT_PAN_ZOOM_MAP.pois; i++) {
		withPois = accept(withPois, env, {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: panZoomMapId,
				layerId: layerIds[i % layerIds.length]!,
				label: `Perf POI ${i}`,
				category: 'other',
				position: { x: 0.05 + ((i * 37) % 90) / 100, y: 0.05 + ((i * 53) % 90) / 100 },
				visibility: 'dm-only',
			},
		});
	}
	const panZoomMap = withPois.maps.maps[panZoomMapId]!;

	const plain = accept(structuredClone(state), env, {
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: {
			name: 'Perf map',
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	const template = Object.values(plain.maps.maps)[0];
	if (!template) throw new Error('Map command did not create a map');
	for (let i = 1; i < LARGE_VAULT_COUNTS.maps; i++) {
		const id = `m${i}`;
		state.maps.maps[id] = {
			...structuredClone(template),
			id,
			name: `Perf map ${i}`,
			layers: template.layers.map((layer, j) => ({
				...structuredClone(layer),
				id: `${id}-l${j}`,
			})),
		};
	}
	state.maps.maps[panZoomMapId] = structuredClone(panZoomMap);

	state = accept(state, env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	});
	const scene = state.scenes.scenes[state.commandCenter.homeSceneId!];
	if (!scene || scene.widgets.length === 0) throw new Error('Home scene has no tiles');
	const tiles = scene.widgets;
	scene.widgets = Array.from({ length: LARGE_VAULT_COUNTS.tiles }, (_, i) => {
		const widget = structuredClone(tiles[i % tiles.length]!);
		return {
			...widget,
			id: `t${i}`,
			layout: { ...widget.layout, x: (i % 6) * 320, y: Math.floor(i / 6) * 240 },
		};
	});
	for (let i = 0; i < LARGE_VAULT_COUNTS.notes; i++) {
		const id = `n${i}`;
		state.content.items[id] = buildContentItem(
			{
				kind: 'note',
				title: largeVaultNoteTitle(i),
				// Two wiki-links per note, as in the standard fixture, so the graph has real edges.
				body: `[[${largeVaultNoteTitle((i + 1) % LARGE_VAULT_COUNTS.notes)}]] [[${largeVaultNoteTitle((i + 7) % LARGE_VAULT_COUNTS.notes)}]]`,
				visibility: i % 3 === 0 ? 'dm-only' : 'player-visible',
			},
			{ id, authorActorId: DM_ACTOR.id, now },
		);
	}
	for (let i = 0; i < LARGE_VAULT_COUNTS.characters; i++) {
		const id = `c${i}`;
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
	for (let i = 0; i < LARGE_VAULT_NOTE_EDITS; i++) {
		const itemId = `n${i}`;
		state = accept(state, env, {
			type: 'content.update-item',
			actorId: DM_ACTOR.id,
			payload: { itemId, body: `${state.content.items[itemId]!.body} Edited.` },
		});
	}
	return state;
}
