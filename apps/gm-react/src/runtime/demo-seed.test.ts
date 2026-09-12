import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	buildDefaultCommandCenterScene,
	createDemoMapState,
	dispatchCommand,
	entityBindingKey,
	getMapViewForActor,
	getSceneForActor,
	isLiveContentItem,
	mergeSystemWidgetPackages,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type EntityBindingRecord,
	type WidgetDataEnvironment,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from './demo-seed';

/**
 * RC-ENG-8.2 — default content never shows an error. The seeded home board's Map tile used to open
 * on "The linked map is missing or was removed." These tests resolve EVERY widget binding on EVERY
 * scene the first boot produces (the demo seed's scenes plus the Command Center home the board
 * creates) against a data environment built from the vault itself, so a binding to an entity the
 * vault does not hold reads `missing` here exactly as it would to the widget. Nothing may resolve
 * missing, conflicted, degraded, disabled or hidden for the DM; the only allowed non-available
 * state is the Map tile's intentional "No map linked" empty state in a vault with no maps.
 */

const DM: Actor = { id: 'actor-dm', role: 'dm', displayName: 'Demo DM' };
// The same participants `SceneRuntime` adds to a demo vault; the seed dispatches as the players.
const PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

function vaultSlice({ withMaps }: { withMaps: boolean }): CoreStateSlice {
	const base = buildInitialState(DM, ...PARTICIPANTS);
	return {
		...base,
		maps: withMaps ? createDemoMapState() : base.maps,
		widgets: mergeSystemWidgetPackages(base.widgets),
	};
}

/** A staged runtime like `SceneRuntime.seedDemoInOneCommit`: every command through the real core. */
function stagedRuntime(initial: CoreStateSlice) {
	const env = makeEnvironment();
	const rejected: string[] = [];
	const dispatched: string[] = [];
	const staged = {
		state: initial,
		defaultActorId: DM.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			dispatched.push(command.type);
			const result = dispatchCommand(staged.state, env, command);
			if (result.status === 'accepted') staged.state = result.nextState;
			else rejected.push(`${command.type}: ${result.rejection.message}`);
			return result;
		},
	};
	return { staged, rejected, dispatched };
}

/** What the Board screen does on first paint: create (or repair) the Command Center home. */
async function openBoard(staged: ReturnType<typeof stagedRuntime>['staged']): Promise<void> {
	const result = await staged.dispatch({
		type: 'command-center.ensure-home',
		actorId: DM.id,
		payload: {},
	});
	expect(result.status).toBe('accepted');
}

function asVisibility(value: string): EntityBindingRecord['visibility'] {
	return value === 'player-visible' || value === 'shared' ? value : 'dm-only';
}

/** The vault's own entities as binding targets; `knownEntityKeys` makes anything else `missing`. */
function vaultDataEnvironment(state: CoreStateSlice): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	const add = (entityType: string, entityId: string, visibility: string) => {
		entities[entityBindingKey(entityType, entityId)] = {
			entityType,
			entityId,
			visibility: asVisibility(visibility),
		};
	};
	for (const map of Object.values(state.maps.maps)) add('map', map.id, map.visibility);
	for (const [id, character] of Object.entries(state.characters.characters)) {
		add('character', id, character.visibility);
	}
	for (const item of Object.values(state.content.items)) {
		if (isLiveContentItem(item)) add(item.kind, item.id, item.visibility);
	}
	for (const scene of Object.values(state.scenes.scenes)) add('scene', scene.id, scene.visibility);
	return {
		entities,
		knownEntityKeys: Object.keys(entities),
		schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	};
}

/** `scene › widget type → payload kind` for every widget on every scene, as the DM receives it. */
function widgetStates(state: CoreStateSlice): string[] {
	const dataEnvironment = vaultDataEnvironment(state);
	const out: string[] = [];
	for (const scene of Object.values(state.scenes.scenes)) {
		const summary = getSceneForActor(state.scenes, state.permissions, DM.id, scene.id, {
			widgetPackages: state.widgets,
			dataEnvironment,
		});
		if ('kind' in summary) {
			out.push(`${scene.name} → denied (${summary.reason})`);
			continue;
		}
		for (const payload of summary.widgets) {
			const type = 'widget' in payload ? payload.widget.type : payload.type;
			out.push(`${scene.name} › ${type} → ${payload.kind}`);
		}
	}
	return out;
}

/**
 * Rejections of the commands that build screens and bind their widgets. The seed's other categories
 * are out of scope here (its audio source is currently rejected by core's http(s)-only stream check).
 */
function boardRejections(rejected: readonly string[]): string[] {
	return rejected.filter((entry) => entry.startsWith('command-center.') || entry.startsWith('scene.'));
}

function homeMapTile(state: CoreStateSlice) {
	const homeId = state.commandCenter.homeSceneId;
	const home = homeId ? state.scenes.scenes[homeId] : undefined;
	return home?.widgets.find((widget) => widget.type === 'map');
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('RC-ENG-8.2 default content never shows an error', () => {
	it('resolves every widget in the demo vault, including the home board, to available', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { staged, rejected } = stagedRuntime(vaultSlice({ withMaps: true }));

		expect(await seedDemoContent(staged)).toBe(true);
		await openBoard(staged);

		expect(boardRejections(rejected)).toEqual([]);
		const states = widgetStates(staged.state);
		expect(states.length).toBeGreaterThan(0);
		expect(states.filter((entry) => !entry.endsWith('→ available'))).toEqual([]);

		// The tile renders `getMapViewForActor`'s view, not the payload kind: that is the read which
		// produced "The linked map is missing or was removed." It must find a real map.
		const tile = homeMapTile(staged.state);
		expect(tile?.binding?.source.entityType).toBe('map');
		const view = getMapViewForActor(
			staged.state.maps,
			staged.state.permissions,
			DM.id,
			tile?.binding?.source.entityId ?? '',
		);
		expect(view.kind).toBe('available');
	});

	it('shows only the intentional "No map linked" empty state in an empty vault', async () => {
		const { staged, rejected } = stagedRuntime(vaultSlice({ withMaps: false }));

		await openBoard(staged);

		expect(rejected).toEqual([]);
		expect(homeMapTile(staged.state)?.binding).toBeNull();
		expect(widgetStates(staged.state).filter((entry) => !entry.endsWith('→ available'))).toEqual([
			'Command Center › map → unbound',
		]);
	});

	it('repairs a home board created before the Map tile was bound, once', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const slice = vaultSlice({ withMaps: true });
		const env = makeEnvironment({ ids: () => `legacy-${Math.random().toString(36).slice(2)}` });
		const legacyHome = buildDefaultCommandCenterScene(env, DM.id);
		const { staged, rejected, dispatched } = stagedRuntime({
			...slice,
			scenes: { ...slice.scenes, scenes: { [legacyHome.id]: legacyHome } },
			commandCenter: { ...slice.commandCenter, homeSceneId: legacyHome.id },
		});
		expect(homeMapTile(staged.state)?.binding).toBeNull();

		expect(await seedDemoContent(staged)).toBe(true);

		expect(boardRejections(rejected)).toEqual([]);
		expect(homeMapTile(staged.state)?.binding?.source.entityType).toBe('map');
		expect(widgetStates(staged.state).filter((entry) => !entry.endsWith('→ available'))).toEqual([]);
		// The repair runs once: with the tile bound, the next boot does not dispatch it again.
		dispatched.length = 0;
		await seedDemoContent(staged);
		expect(dispatched).not.toContain('command-center.ensure-home');
	});
});
