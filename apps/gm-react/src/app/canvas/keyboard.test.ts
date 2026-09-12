import { describe, expect, it } from 'vitest';
import { readingOrder, spatialNeighbour } from './keyboard';

describe('canvas keyboard navigation', () => {
	it('honours metadata, removes duplicate/stale entries and includes new tiles', () => {
		expect(readingOrder(['a', 'b', 'c'], ['b', 'gone', 'b', 'a'])).toEqual(['b', 'a', 'c']);
	});
	it('uses geometry rather than metadata order, including unequal sizes and directional edges', () => {
		const tiles = [
			{ id: 'origin', x: 0, y: 0, w: 100, h: 100 },
			{ id: 'far', x: 500, y: 0, w: 100, h: 100 },
			{ id: 'below', x: 0, y: 150, w: 100, h: 200 },
			{ id: 'near', x: 150, y: 0, w: 200, h: 100 },
		];
		expect(spatialNeighbour(tiles, 'origin', [1, 0])).toBe('near');
		expect(spatialNeighbour(tiles, 'origin', [0, 1])).toBe('below');
		expect(spatialNeighbour(tiles, 'origin', [-1, 0])).toBeUndefined();
		expect(spatialNeighbour(tiles, 'missing', [1, 0])).toBeUndefined();
	});
});

it('resolves equal spatial distances using metadata reading order', () => {
	const origin = { id: 'origin', x: 0, y: 0, w: 20, h: 20 };
	const a = { ...origin, id: 'a', x: 100, y: 30 };
	const b = { ...origin, id: 'b', x: 100, y: -30 };
	expect(spatialNeighbour([origin, b, a], 'origin', [1, 0])).toBe('b');
	expect(spatialNeighbour([origin, a, b], 'origin', [1, 0])).toBe('a');
});
