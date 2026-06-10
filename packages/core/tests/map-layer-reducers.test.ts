import { describe, expect, it } from 'vitest';
import {
	createLayer,
	deleteLayer,
	duplicateLayer,
	renameLayer,
	reorderLayer,
	setLayerDmEnabled,
	setLayerLock,
	setLayerOpacity,
	setLayerPlayerVisibility,
	setLayerTags,
	sortedLayers,
	normalizeMapLayer,
	type MapLayer,
} from '../src';

const STAMP = { actorId: 'actor-dm', now: '2026-06-04T00:00:00.000Z' };

function layer(id: string, order: number, overrides: Partial<MapLayer> = {}): MapLayer {
	return normalizeMapLayer(
		{
			id,
			name: id,
			category: 'dm-annotations',
			visibility: 'dm-only',
			enabled: true,
			opacity: 1,
			...overrides,
		},
		order,
	);
}

function names(layers: MapLayer[]): string[] {
	return sortedLayers({ layers } as never).map((l) => l.id);
}

function ok<T extends { layers: MapLayer[] }>(result: T | { error: unknown }): T {
	if ('error' in result) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
	return result;
}

describe('MAP-005 createLayer', () => {
	it('appends a layer with dense order and full metadata', () => {
		const start = [layer('a', 0), layer('b', 1)];
		const result = ok(
			createLayer(
				start,
				{
					id: 'c',
					name: 'Camps',
					category: 'poi',
					visibility: 'player-visible',
					enabled: true,
					opacity: 0.5,
					tags: ['region:coast'],
					query: { region: 'coast' },
					locked: false,
				},
				STAMP,
			),
		);
		expect(names(result.layers)).toEqual(['a', 'b', 'c']);
		const created = result.layers.find((l) => l.id === 'c')!;
		expect(created.order).toBe(2);
		expect(created.tags).toEqual(['region:coast']);
		expect(created.query).toEqual({ region: 'coast' });
		expect(created.revision).toBe(1);
	});

	it('inserts at a position and re-packs order densely', () => {
		const start = [layer('a', 0), layer('b', 1)];
		const result = ok(
			createLayer(
				start,
				{
					id: 'mid',
					name: 'Mid',
					category: 'base',
					visibility: 'dm-only',
					enabled: true,
					opacity: 1,
					tags: [],
					query: {},
					locked: false,
					atOrder: 1,
				},
				STAMP,
			),
		);
		expect(names(result.layers)).toEqual(['a', 'mid', 'b']);
		expect(result.layers.map((l) => l.order).sort()).toEqual([0, 1, 2]);
	});

	it('rejects a duplicate id, blank name, and out-of-range opacity', () => {
		const start = [layer('a', 0)];
		const base = {
			name: 'X',
			category: 'base' as const,
			visibility: 'dm-only' as const,
			enabled: true,
			opacity: 1,
			tags: [],
			query: {},
			locked: false,
		};
		expect(createLayer(start, { ...base, id: 'a' }, STAMP)).toMatchObject({
			error: { kind: 'duplicate-layer-id' },
		});
		expect(createLayer(start, { ...base, id: 'b', name: '  ' }, STAMP)).toMatchObject({
			error: { kind: 'invalid-name' },
		});
		expect(createLayer(start, { ...base, id: 'c', opacity: 2 }, STAMP)).toMatchObject({
			error: { kind: 'invalid-opacity' },
		});
	});
});

describe('MAP-005 reorder persists and changes render order', () => {
	it('moving C above A reorders and re-packs', () => {
		// AC: Given three layers, reorder Layer C above Layer A → order changes accordingly.
		const start = [layer('A', 0), layer('B', 1), layer('C', 2)];
		const result = ok(reorderLayer(start, 'C', 0, STAMP));
		expect(names(result.layers)).toEqual(['C', 'A', 'B']);
		expect(result.layers.find((l) => l.id === 'C')!.order).toBe(0);
		// Re-packed dense, no gaps/ties.
		expect([...result.layers.map((l) => l.order)].sort()).toEqual([0, 1, 2]);
	});

	it('rejects an out-of-range order', () => {
		const start = [layer('A', 0), layer('B', 1)];
		expect(reorderLayer(start, 'A', 5, STAMP)).toMatchObject({ error: { kind: 'invalid-order' } });
	});
});

describe('MAP-005 duplicate', () => {
	it('inserts an unlocked copy right after the source with a (copy) name', () => {
		const start = [layer('a', 0, { locked: true, tags: ['t'] }), layer('b', 1)];
		const result = duplicateLayer(start, 'a', 'a-copy', STAMP);
		if ('error' in result) throw new Error('expected success');
		expect(names(result.layers)).toEqual(['a', 'a-copy', 'b']);
		const copy = result.layers.find((l) => l.id === 'a-copy')!;
		expect(copy.name).toBe('a (copy)');
		expect(copy.locked).toBe(false); // copy is editable even though the source is locked
		expect(copy.tags).toEqual(['t']);
	});
});

describe('MAP-005 lock rejects mutation fail-closed', () => {
	it('a locked layer rejects rename/reorder/delete/visibility/opacity/tags', () => {
		// AC: Given a locked layer, an edit command is rejected.
		const start = [layer('a', 0, { locked: true }), layer('b', 1)];
		expect(renameLayer(start, 'a', 'x', STAMP)).toMatchObject({ error: { kind: 'layer-locked' } });
		expect(reorderLayer(start, 'a', 1, STAMP)).toMatchObject({ error: { kind: 'layer-locked' } });
		expect(deleteLayer(start, 'a', STAMP)).toMatchObject({ error: { kind: 'layer-locked' } });
		expect(setLayerPlayerVisibility(start, 'a', 'player-visible', STAMP)).toMatchObject({
			error: { kind: 'layer-locked' },
		});
		expect(setLayerOpacity(start, 'a', 0.5, STAMP)).toMatchObject({
			error: { kind: 'layer-locked' },
		});
		expect(setLayerDmEnabled(start, 'a', false, STAMP)).toMatchObject({
			error: { kind: 'layer-locked' },
		});
		expect(setLayerTags(start, 'a', ['x'], {}, STAMP)).toMatchObject({
			error: { kind: 'layer-locked' },
		});
	});

	it('unlocking a locked layer is the only mutation it accepts', () => {
		const start = [layer('a', 0, { locked: true }), layer('b', 1)];
		const unlocked = ok(setLayerLock(start, 'a', false, STAMP));
		expect(unlocked.layers.find((l) => l.id === 'a')!.locked).toBe(false);
		// Now it accepts edits.
		expect('error' in renameLayer(unlocked.layers, 'a', 'x', STAMP)).toBe(false);
	});
});

describe('MAP-005 delete', () => {
	it('removes a layer, re-packs order, and refuses the last layer', () => {
		const start = [layer('a', 0), layer('b', 1)];
		const result = ok(deleteLayer(start, 'a', STAMP));
		expect(names(result.layers)).toEqual(['b']);
		expect(result.layers[0]!.order).toBe(0);
		expect(deleteLayer(result.layers, 'b', STAMP)).toMatchObject({ error: { kind: 'last-layer' } });
	});
});

describe('MAP-006 the three presentation axes are independent', () => {
	const start = [
		layer('a', 0, { visibility: 'dm-only', enabled: true, opacity: 1 }),
		layer('b', 1, { visibility: 'player-visible', enabled: true, opacity: 0.5 }),
		layer('c', 2, { visibility: 'dm-only', enabled: false, opacity: 0.2 }),
	];

	it('changing player-visibility leaves enabled and opacity untouched', () => {
		const result = ok(setLayerPlayerVisibility(start, 'a', 'player-visible', STAMP));
		const a = result.layers.find((l) => l.id === 'a')!;
		expect(a.visibility).toBe('player-visible');
		expect(a.enabled).toBe(true); // unchanged
		expect(a.opacity).toBe(1); // unchanged
	});

	it('changing opacity leaves visibility and enabled untouched', () => {
		const result = ok(setLayerOpacity(start, 'b', 0.9, STAMP));
		const b = result.layers.find((l) => l.id === 'b')!;
		expect(b.opacity).toBe(0.9);
		expect(b.visibility).toBe('player-visible'); // unchanged
		expect(b.enabled).toBe(true); // unchanged
	});

	it('changing one layer never touches another layer', () => {
		const result = ok(setLayerPlayerVisibility(start, 'a', 'player-visible', STAMP));
		// b and c are byte-identical references to the inputs (never re-stamped).
		expect(result.layers.find((l) => l.id === 'b')).toBe(start[1]);
		expect(result.layers.find((l) => l.id === 'c')).toBe(start[2]);
	});

	it('a no-op visibility/opacity change does not bump the revision', () => {
		const r1 = ok(setLayerPlayerVisibility(start, 'b', 'player-visible', STAMP));
		expect(r1.layers.find((l) => l.id === 'b')).toBe(start[1]); // same level → no change
		const r2 = ok(setLayerOpacity(start, 'b', 0.5, STAMP));
		expect(r2.layers.find((l) => l.id === 'b')).toBe(start[1]); // same opacity → no change
	});
});
