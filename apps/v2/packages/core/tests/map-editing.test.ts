import { describe, expect, it } from 'vitest';
import {
	applyLayerEdit,
	buildInverseMapEditCommand,
	featuresEqual,
	layerContent,
	normalizeMapLayer,
	type MapEntity,
	type MapFeature,
	type MapLayer,
} from '../src';

const STAMP = { actorId: 'actor-dm', now: '2026-06-04T00:00:00.000Z' };

function feature(id: string, x: number, y: number, style = 'ink:black'): MapFeature {
	return { id, kind: 'stroke', points: [{ x, y }], style };
}

function layer(
	id: string,
	content: MapFeature[] = [],
	overrides: Partial<MapLayer> = {},
): MapLayer {
	return normalizeMapLayer(
		{
			id,
			name: id,
			category: 'dm-annotations',
			visibility: 'dm-only',
			enabled: true,
			opacity: 1,
			content,
			...overrides,
		},
		0,
	);
}

function ok<T extends { layers: MapLayer[] }>(result: T | { error: unknown }): T {
	if ('error' in result) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
	return result;
}

function err<E>(result: { layers: MapLayer[] } | { error: E }): E {
	if (!('error' in result)) throw new Error('expected an error');
	return result.error;
}

describe('MAP-003 featuresEqual', () => {
	it('is true for deep-equal content and false on any difference', () => {
		const a = [feature('f1', 0.1, 0.2), feature('f2', 0.3, 0.4)];
		const b = [feature('f1', 0.1, 0.2), feature('f2', 0.3, 0.4)];
		expect(featuresEqual(a, b)).toBe(true);
		expect(featuresEqual(a, [feature('f1', 0.1, 0.2)])).toBe(false);
		expect(featuresEqual(a, [feature('f1', 0.1, 0.2), feature('f2', 0.3, 0.41)])).toBe(false);
		expect(featuresEqual(a, [feature('f1', 0.1, 0.2), feature('fX', 0.3, 0.4)])).toBe(false);
	});
});

describe('MAP-003 applyLayerEdit', () => {
	it('AC1: an edit replaces content, and undo (swapped before/after) restores it EXACTLY', () => {
		const before: MapFeature[] = [];
		const after = [feature('stroke-1', 0.5, 0.5)];
		const start = [layer('paint', before)];

		// Forward edit: paint a stroke.
		const forward = ok(applyLayerEdit(start, { layerId: 'paint', before, after }, STAMP));
		const painted = forward.layers.find((l) => l.id === 'paint')!;
		expect(painted.content).toEqual(after);
		expect(painted.revision).toBe(2); // bumped from 1.

		// Undo: apply the inverse (before/after swapped). Restores the captured prior content exactly.
		const undone = ok(
			applyLayerEdit(forward.layers, { layerId: 'paint', before: after, after: before }, STAMP),
		);
		const restored = undone.layers.find((l) => l.id === 'paint')!;
		expect(restored.content).toEqual(before);
		expect(featuresEqual(restored.content, start[0]!.content)).toBe(true);
	});

	it('a re-apply (redo) of the same after-content is consistent', () => {
		const before: MapFeature[] = [];
		const after = [feature('s', 0.2, 0.2)];
		const start = [layer('paint', before)];
		const first = ok(applyLayerEdit(start, { layerId: 'paint', before, after }, STAMP));
		// Re-applying after onto the already-painted layer requires the matching before-base.
		const redo = ok(
			applyLayerEdit(first.layers, { layerId: 'paint', before: after, after }, STAMP),
		);
		expect(redo.layers.find((l) => l.id === 'paint')!.content).toEqual(after);
	});

	it('does not mutate the input layers or alias the after array', () => {
		const before: MapFeature[] = [];
		const after = [feature('s', 0.2, 0.2)];
		const start = [layer('paint', before)];
		const result = ok(applyLayerEdit(start, { layerId: 'paint', before, after }, STAMP));
		expect(start[0]!.content).toEqual([]); // input untouched.
		// Mutating the returned content must not reach back into the supplied after array.
		result.layers.find((l) => l.id === 'paint')!.content[0]!.points[0]!.x = 0.99;
		expect(after[0]!.points[0]!.x).toBe(0.2);
	});

	it('rejects a locked layer fail-closed (MAP-005 parity)', () => {
		const start = [layer('paint', [], { locked: true })];
		const error = err(
			applyLayerEdit(
				start,
				{ layerId: 'paint', before: [], after: [feature('s', 0.1, 0.1)] },
				STAMP,
			),
		);
		expect(error.kind).toBe('layer-locked');
	});

	it('rejects an unknown layer', () => {
		const error = err(
			applyLayerEdit([layer('a')], { layerId: 'missing', before: [], after: [] }, STAMP),
		);
		expect(error.kind).toBe('layer-not-found');
	});

	it('rejects a stale before-base (optimistic concurrency) so a concurrent edit is not clobbered', () => {
		const start = [layer('paint', [feature('existing', 0.1, 0.1)])];
		// The caller thinks the layer is empty, but it already has content — stale base.
		const error = err(
			applyLayerEdit(
				start,
				{ layerId: 'paint', before: [], after: [feature('new', 0.2, 0.2)] },
				STAMP,
			),
		);
		expect(error.kind).toBe('stale-before');
	});

	it('rejects content with a point outside normalized [0,1] map space', () => {
		const bad = err(
			applyLayerEdit(
				[layer('paint')],
				{ layerId: 'paint', before: [], after: [feature('s', 1.5, 0.2)] },
				STAMP,
			),
		);
		expect(bad.kind).toBe('invalid-content');
		const empty = err(
			applyLayerEdit(
				[layer('paint')],
				{
					layerId: 'paint',
					before: [],
					after: [{ id: 'e', kind: 'fill', points: [], style: 's' }],
				},
				STAMP,
			),
		);
		expect(empty.kind).toBe('invalid-content');
	});

	it('only touches the edited layer, never its siblings', () => {
		const sibling = layer('other', [feature('keep', 0.9, 0.9)]);
		const start = [layer('paint'), sibling];
		const result = ok(
			applyLayerEdit(
				start,
				{ layerId: 'paint', before: [], after: [feature('s', 0.1, 0.1)] },
				STAMP,
			),
		);
		const after = result.layers.find((l) => l.id === 'other')!;
		expect(after).toBe(sibling); // unchanged reference.
	});
});

describe('MAP-003 layerContent / buildInverseMapEditCommand', () => {
	it('reads a deep copy of a layer content as the next edit base', () => {
		const map = { layers: [layer('paint', [feature('s', 0.3, 0.3)])] } as MapEntity;
		const base = layerContent(map, 'paint');
		expect(base).toEqual([feature('s', 0.3, 0.3)]);
		base[0]!.points[0]!.x = 0.99;
		expect(map.layers[0]!.content[0]!.points[0]!.x).toBe(0.3); // source untouched.
		expect(layerContent(map, 'missing')).toEqual([]);
	});

	it('builds the inverse edit command by swapping before/after', () => {
		const forward = { mapId: 'm', layerId: 'l', before: ['B'], after: ['A'] };
		expect(buildInverseMapEditCommand(forward)).toEqual({
			mapId: 'm',
			layerId: 'l',
			before: ['A'],
			after: ['B'],
		});
	});
});
