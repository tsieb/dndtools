import { describe, expect, it } from 'vitest';
import type { MapFeature } from '../state/map-state';
import { deriveRoomGraph, readStocking, ROOM_STOCKING_KINDS, withStocking } from './room-graph';

function feature(
	id: string,
	kind: MapFeature['kind'],
	points: Array<{ x: number; y: number }>,
	style: string,
	props?: MapFeature['props'],
): MapFeature {
	return props ? { id, kind, points, style, props } : { id, kind, points, style };
}

function layer(id: string, content: MapFeature[]): { id: string; content: MapFeature[] } {
	return { id, content };
}

function rect(x: number, y: number, w: number, h: number) {
	return [
		{ x, y },
		{ x: x + w, y: y + h },
	];
}

/** Two rooms joined by a corridor polygon that overlaps both — the generators' own shape. */
function twoRoomDungeon(): Array<{ id: string; content: MapFeature[] }> {
	return [
		layer('floor', [
			feature('room-a', 'room', rect(0.1, 0.1, 0.1, 0.1), 'dungeon:room', {
				role: 'entrance',
				name: 'Gatehouse',
			}),
			feature('room-b', 'room', rect(0.5, 0.1, 0.1, 0.1), 'dungeon:room', { role: 'boss' }),
			feature(
				'hall-1',
				'polygon',
				[
					{ x: 0.15, y: 0.14 },
					{ x: 0.55, y: 0.14 },
					{ x: 0.55, y: 0.16 },
					{ x: 0.15, y: 0.16 },
				],
				'dungeon:corridor',
			),
		]),
	];
}

describe('deriveRoomGraph', () => {
	it('derives rooms, corridors and the passages between them', () => {
		const graph = deriveRoomGraph(twoRoomDungeon());

		expect(graph.roomCount).toBe(2);
		expect(graph.corridorCount).toBe(1);
		expect(graph.nodes.map((node) => node.id)).toEqual(['room-a', 'room-b', 'hall-1']);
		expect(graph.nodes.map((node) => node.number)).toEqual([1, 2, null]);
		expect(graph.edges).toEqual([
			{ from: 'hall-1', to: 'room-a', kind: 'passage' },
			{ from: 'hall-1', to: 'room-b', kind: 'passage' },
		]);
		expect(graph.unreachable).toEqual([]);
	});

	it('names a node from props.name, then its role, then its key number', () => {
		const graph = deriveRoomGraph(twoRoomDungeon());
		expect(graph.nodes.map((node) => node.label)).toEqual(['Gatehouse', 'boss', 'Corridor 1']);
	});

	it('anchors each node to its feature id, layer and centroid', () => {
		const [entrance] = deriveRoomGraph(twoRoomDungeon()).nodes;
		expect(entrance?.id).toBe('room-a');
		expect(entrance?.layerId).toBe('floor');
		expect(entrance?.centre).toEqual({ x: 0.15000000000000002, y: 0.15000000000000002 });
		expect(entrance?.bounds).toEqual({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 });
		expect(entrance?.degree).toBe(1);
	});

	it('does not connect two rooms that merely graze — only a hall or a door joins them', () => {
		const graph = deriveRoomGraph([
			layer('floor', [
				feature('room-a', 'room', rect(0.1, 0.1, 0.1, 0.1), 'dungeon:room'),
				feature('room-b', 'room', rect(0.2, 0.1, 0.1, 0.1), 'dungeon:room'),
			]),
		]);
		expect(graph.edges).toEqual([]);
		expect(graph.unreachable).toEqual(['room-b']);
	});

	it('joins two rooms across a shared wall through a door feature', () => {
		const graph = deriveRoomGraph([
			layer('floor', [
				feature('room-a', 'room', rect(0.1, 0.1, 0.1, 0.1), 'dungeon:room'),
				feature('room-b', 'room', rect(0.2, 0.1, 0.1, 0.1), 'dungeon:room'),
			]),
			layer('doors', [
				feature(
					'door-1',
					'door',
					[
						{ x: 0.199, y: 0.14 },
						{ x: 0.201, y: 0.16 },
					],
					'dungeon:door',
					{ portal: 'door', state: 'closed' },
				),
			]),
		]);
		expect(graph.edges).toEqual([{ from: 'room-a', to: 'room-b', kind: 'door' }]);
		expect(graph.unreachable).toEqual([]);
	});

	it('reports a wing nothing connects to as unreachable, from the entrance', () => {
		const layers = twoRoomDungeon();
		layers[0]?.content.push(feature('room-c', 'room', rect(0.8, 0.8, 0.05, 0.05), 'dungeon:room'));
		const graph = deriveRoomGraph(layers);
		expect(graph.unreachable).toEqual(['room-c']);
	});

	it('reads stocking off the feature props and counts the keyed rooms', () => {
		const layers = twoRoomDungeon();
		const room = layers[0]?.content[0] as MapFeature;
		room.props = { ...room.props, stocking: 'monster' };
		const graph = deriveRoomGraph(layers);
		expect(graph.nodes[0]?.stocking).toBe('monster');
		expect(graph.nodes[1]?.stocking).toBeNull();
		expect(graph.stockedRooms).toBe(1);
	});

	it('treats an unrecognised stocking value as not keyed rather than trusting it', () => {
		expect(
			readStocking(feature('x', 'room', rect(0, 0, 1, 1), 'dungeon:room', { stocking: 'dragon' })),
		).toBeNull();
		expect(readStocking(feature('x', 'room', rect(0, 0, 1, 1), 'dungeon:room'))).toBeNull();
	});

	it('ignores everything that is not floor — walls, markers, text, lights', () => {
		const graph = deriveRoomGraph([
			layer('annotations', [
				feature('wall-1', 'wall', rect(0, 0, 0.5, 0), 'dungeon:wall'),
				feature('mark-1', 'marker', [{ x: 0.2, y: 0.2 }], 'graph:entrance', { role: 'entrance' }),
				feature('text-1', 'text', [{ x: 0.3, y: 0.3 }], 'ink:black', { text: 'Crypt' }),
				feature('light-1', 'light', [{ x: 0.4, y: 0.4 }], 'light:torch'),
			]),
		]);
		expect(graph.nodes).toEqual([]);
		expect(graph.edges).toEqual([]);
		expect(graph.unreachable).toEqual([]);
	});

	it('restricts the derivation to the named layers', () => {
		const layers = [
			...twoRoomDungeon(),
			layer('sketch', [feature('room-x', 'room', rect(0.3, 0.3, 0.1, 0.1), 'dungeon:room')]),
		];
		expect(deriveRoomGraph(layers, { layerIds: ['floor'] }).roomCount).toBe(2);
		expect(deriveRoomGraph(layers).roomCount).toBe(3);
	});

	it('is deterministic — the same layers derive an identical graph', () => {
		expect(deriveRoomGraph(twoRoomDungeon())).toEqual(deriveRoomGraph(twoRoomDungeon()));
	});
});

describe('withStocking', () => {
	it('sets the stocking prop without disturbing the geometry or the other props', () => {
		const room = feature('room-a', 'room', rect(0.1, 0.1, 0.1, 0.1), 'dungeon:room', {
			role: 'boss',
			name: 'Throne',
		});
		const next = withStocking(room, 'treasure');
		expect(next.props).toEqual({ role: 'boss', name: 'Throne', stocking: 'treasure' });
		expect(next.points).toEqual(room.points);
		expect(next.style).toBe('dungeon:room');
		expect(room.props?.stocking).toBeUndefined();
	});

	it('removes the prop when the stocking is cleared, and leaves no empty props record', () => {
		const room = feature('room-a', 'room', rect(0.1, 0.1, 0.1, 0.1), 'dungeon:room', {
			stocking: 'trap',
		});
		expect(withStocking(room, null).props).toBeUndefined();
		expect(withStocking(feature('r', 'room', rect(0, 0, 1, 1), 's'), null).props).toBeUndefined();
	});

	it('round-trips every stocking kind', () => {
		for (const kind of ROOM_STOCKING_KINDS) {
			expect(readStocking(withStocking(feature('r', 'room', rect(0, 0, 1, 1), 's'), kind))).toBe(
				kind,
			);
		}
	});
});
