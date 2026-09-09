// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchCommand, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import type { BoardWidget } from '../../board-helpers';
import { I18nProvider } from '../../../i18n';

/**
 * RC-CAN-4.5 — the map tile takes NO visibility decision of its own.
 *
 * `/board` is the DM's own control board, so there is no player-facing canvas to drive an e2e
 * through yet; what a player-view projection of this tile would draw is therefore proved here, at
 * the tile itself. The same state, the same widget, two different viewing actors: the fog the core
 * hands back is drawn at the PLAYER's opacity for a player (it conceals rather than hints), and a
 * map the core withholds collapses to "not available to you" rather than to an empty frame that
 * reads like "there is nothing here".
 */

const runtimeRef: {
	state: CoreStateSlice;
	defaultActorId: string;
	dispatch: ReturnType<typeof vi.fn>;
} = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
	dispatch: vi.fn(async () => ({ status: 'accepted' as const })),
};

vi.mock('../../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

// No raster bytes in a test vault; the geometry layers are what this file is about.
vi.mock('../../../platform/assetUrl', () => ({
	useAssetObjectUrl: () => null,
	createAssetObjectUrl: async () => null,
}));

const { MapTile } = await import('./Map');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

interface Fixture {
	state: CoreStateSlice;
	sharedMapId: string;
	hiddenMapId: string;
}

/** A player-visible map carrying a player-visible concealed patch, plus a map only the DM may see. */
function fixture(): Fixture {
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
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: {
			name: 'Tidal steps',
			visibility: 'player-visible',
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'player-visible' }],
		},
	});
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'The vault below', visibility: 'dm-only' },
	});
	const [shared, hidden] = Object.values(state.maps.maps).sort((a, b) =>
		a.name.localeCompare(b.name),
	) as Array<{ id: string; name: string; layers: Array<{ id: string }> }>;
	const sharedMap = shared!.name === 'Tidal steps' ? shared! : hidden!;
	const hiddenMap = sharedMap === shared! ? hidden! : shared!;
	run({
		type: 'map.append-fog',
		actorId: DM_ACTOR.id,
		payload: {
			mapId: sharedMap.id,
			layerId: sharedMap.layers[0]!.id,
			kind: 'conceal',
			region: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
			visibility: 'player-visible',
		},
	});
	return { state, sharedMapId: sharedMap.id, hiddenMapId: hiddenMap.id };
}

function tile(mapId: string): BoardWidget {
	return {
		id: 'widget-map',
		type: 'map',
		title: 'Map',
		typeLabel: 'Maps',
		icon: 'atlas-map',
		tier: 'system',
		description: 'A bound map with its visible layers.',
		visibility: 'player-visible',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration: {},
		configFields: [],
		requiresBinding: true,
		commands: [],
		bindingRef: { entityType: 'map', entityId: mapId },
	};
}

/** Render the tile as one actor and hand back the container. */
function renderAs(state: CoreStateSlice, actorId: string, widget: BoardWidget): HTMLDivElement {
	runtimeRef.state = state;
	runtimeRef.defaultActorId = actorId;
	act(() =>
		root.render(
			<I18nProvider>
				<MapTile widget={widget} />
			</I18nProvider>,
		),
	);
	return container;
}

/** The opacity the composed fog mask is painted at (null when no fog is drawn at all). */
function fogOpacity(host: HTMLElement): string | null {
	return host.querySelector('rect[mask]')?.getAttribute('opacity') ?? null;
}

describe('the map tile draws the viewing actor’s own view', () => {
	it('paints the DM’s fog at the DM opacity — it hints, so the DM can still read under it', () => {
		const { state, sharedMapId } = fixture();
		expect(fogOpacity(renderAs(state, DM_ACTOR.id, tile(sharedMapId)))).toBe(
			'var(--map-fog-opacity-dm)',
		);
	});

	it('paints the same fog at the player opacity for a player — a projection of it conceals', () => {
		const { state, sharedMapId } = fixture();
		expect(fogOpacity(renderAs(state, PLAYER_ACTOR.id, tile(sharedMapId)))).toBe(
			'var(--map-fog-opacity-player)',
		);
	});

	it('tells a player a map they may not see is unavailable rather than drawing an empty frame', () => {
		const { state, hiddenMapId } = fixture();
		const host = renderAs(state, PLAYER_ACTOR.id, tile(hiddenMapId));
		expect(host.textContent).toContain('isn’t available to you');
		expect(host.querySelector('[data-testid="map-canvas-well"]')).toBeNull();
	});

	it('offers a player none of the DM actions even in view mode', () => {
		const { state, sharedMapId } = fixture();
		runtimeRef.state = state;
		runtimeRef.defaultActorId = PLAYER_ACTOR.id;
		act(() =>
			root.render(
				<I18nProvider>
					<MapTile widget={tile(sharedMapId)} onCommand={() => {}} />
				</I18nProvider>,
			),
		);
		const labels = Array.from(container.querySelectorAll('button')).map(
			(button) => button.getAttribute('aria-label') ?? '',
		);
		expect(labels).not.toContain('Project to players');
		expect(labels).not.toContain('Hide combat overlay');
		expect(container.querySelector('select')).toBeNull();
	});
});
