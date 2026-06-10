import { describe, expect, it } from 'vitest';
import {
	createRng,
	generateMapLayers,
	normalizeSeed,
	validateGenerationParams,
	type MapGenerationParams,
} from '../src';

const STAMP = { actorId: 'actor-dm', now: '2026-06-04T00:00:00.000Z' };

function params(overrides: Partial<MapGenerationParams> = {}): MapGenerationParams {
	return {
		kind: 'dungeon',
		seed: 42,
		width: 8,
		height: 8,
		density: 0.5,
		visibility: 'dm-only',
		idPrefix: 'gen1',
		...overrides,
	};
}

function ok(result: ReturnType<typeof generateMapLayers>) {
	if ('error' in result) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
	return result;
}

describe('MAP-004 seeded PRNG (determinism anchor)', () => {
	it('produces an identical stream for the same seed and a different stream for a different seed', () => {
		const a = createRng('seed-a');
		const b = createRng('seed-a');
		const c = createRng('seed-b');
		const streamA = Array.from({ length: 8 }, () => a.next());
		const streamB = Array.from({ length: 8 }, () => b.next());
		const streamC = Array.from({ length: 8 }, () => c.next());
		expect(streamA).toEqual(streamB);
		expect(streamA).not.toEqual(streamC);
	});

	it('uses no ambient nondeterminism (numeric and string seeds both normalize stably)', () => {
		expect(normalizeSeed(42)).toBe(normalizeSeed(42));
		expect(normalizeSeed('hello')).toBe(normalizeSeed('hello'));
		expect(normalizeSeed(-7.9)).toBe(normalizeSeed(-7.9));
		expect(normalizeSeed('a')).not.toBe(normalizeSeed('b'));
	});

	it('nextInt stays within the inclusive bounds', () => {
		const rng = createRng(1);
		for (let i = 0; i < 200; i += 1) {
			const v = rng.nextInt(3, 7);
			expect(v).toBeGreaterThanOrEqual(3);
			expect(v).toBeLessThanOrEqual(7);
			expect(Number.isInteger(v)).toBe(true);
		}
	});
});

describe('MAP-004 generateMapLayers determinism (AC1)', () => {
	for (const kind of ['terrain', 'settlement', 'dungeon'] as const) {
		it(`${kind}: the same params + seed reproduce byte-identical layers`, () => {
			const first = ok(generateMapLayers(params({ kind }), STAMP));
			const second = ok(generateMapLayers(params({ kind }), STAMP));
			// Byte-identical via JSON: the determinism contract for sync replay (Contract 2).
			expect(JSON.stringify(first.layers)).toBe(JSON.stringify(second.layers));
			expect(first.layers.length).toBeGreaterThan(0);
		});

		it(`${kind}: a different seed produces different output`, () => {
			const a = ok(generateMapLayers(params({ kind, seed: 1 }), STAMP));
			const b = ok(generateMapLayers(params({ kind, seed: 2 }), STAMP));
			expect(JSON.stringify(a.layers)).not.toBe(JSON.stringify(b.layers));
		});
	}

	it('generation does not depend on Date.now/Math.random (a stubbed clock changes nothing)', () => {
		const a = ok(
			generateMapLayers(params(), { actorId: 'actor-dm', now: '2000-01-01T00:00:00.000Z' }),
		);
		const b = ok(
			generateMapLayers(params(), { actorId: 'actor-dm', now: '2099-12-31T23:59:59.999Z' }),
		);
		// The audit stamp differs, but the GEOMETRY (content) is identical regardless of wall-clock.
		expect(a.layers.map((l) => l.content)).toEqual(b.layers.map((l) => l.content));
	});

	it('generated layer/feature ids are derived from idPrefix, not random/time', () => {
		const result = ok(generateMapLayers(params({ kind: 'dungeon', idPrefix: 'crypt' }), STAMP));
		expect(result.layers.every((l) => l.id.startsWith('crypt'))).toBe(true);
		for (const layer of result.layers) {
			for (const feature of layer.content) {
				expect(feature.id.startsWith('crypt')).toBe(true);
			}
		}
	});
});

describe('MAP-004 generated layers are editable map layers (MAP-005 shape)', () => {
	it('every generated layer is a fully-formed, unlocked, editable MAP-005 layer', () => {
		const result = ok(generateMapLayers(params({ kind: 'settlement' }), STAMP));
		for (const layer of result.layers) {
			expect(layer.locked).toBe(false); // immediately editable.
			expect(typeof layer.revision).toBe('number');
			expect(Array.isArray(layer.tags)).toBe(true);
			expect(Array.isArray(layer.content)).toBe(true);
			// Content geometry is in normalized [0,1] map space.
			for (const feature of layer.content) {
				for (const point of feature.points) {
					expect(point.x).toBeGreaterThanOrEqual(0);
					expect(point.x).toBeLessThanOrEqual(1);
					expect(point.y).toBeGreaterThanOrEqual(0);
					expect(point.y).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe('MAP-004 validation fail-closed (AC2: no partial layers on rejection)', () => {
	it('rejects an out-of-range dimension and returns NO layers', () => {
		expect(validateGenerationParams(params({ width: 0 }))?.kind).toBe('invalid-dimension');
		expect(validateGenerationParams(params({ height: 1000 }))?.kind).toBe('invalid-dimension');
		const result = generateMapLayers(params({ width: 0 }), STAMP);
		expect('error' in result).toBe(true);
		expect('layers' in result).toBe(false);
	});

	it('rejects an out-of-range density', () => {
		expect(validateGenerationParams(params({ density: 1.5 }))?.kind).toBe('invalid-density');
		expect(validateGenerationParams(params({ density: -0.1 }))?.kind).toBe('invalid-density');
	});

	it('rejects an empty id prefix', () => {
		expect(validateGenerationParams(params({ idPrefix: '  ' }))?.kind).toBe('invalid-id-prefix');
	});

	it('accepts valid params', () => {
		expect(validateGenerationParams(params())).toBeNull();
	});
});
