import { describe, expect, it } from 'vitest';
import { nearestPoiInDirection } from './keyboard';

/**
 * RC-MAP-4.2 — the cardinal-direction nearest-POI picker that backs keyboard browsing of a map's
 * points of interest. Pure function, no editor/DOM needed: it just has to prefer the POI that is
 * actually ahead in the pressed direction, and prefer "mostly on-axis" over "merely closer".
 */
describe('nearestPoiInDirection', () => {
	const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });

	it('picks the closest POI strictly ahead in the given direction', () => {
		const pois = [at('near', 0.5, 0.3), at('far', 0.5, 0.1), at('behind', 0.5, 0.6)];
		const result = nearestPoiInDirection(pois, { x: 0.5, y: 0.5 }, 'up');
		expect(result?.id).toBe('near');
	});

	it('ignores POIs behind the origin on that axis, even if closer in raw distance', () => {
		const pois = [at('behind', 0.5, 0.51), at('ahead', 0.5, 0.2)];
		const result = nearestPoiInDirection(pois, { x: 0.5, y: 0.5 }, 'up');
		expect(result?.id).toBe('ahead');
	});

	it('prefers a POI more on-axis over one merely closer but far off to the side', () => {
		// 'onAxis' is farther north but directly ahead; 'offAxis' is nominally closer as the crow
		// flies but almost entirely sideways — a real "north" press should land on 'onAxis'.
		const onAxis = at('onAxis', 0.5, 0.2);
		const offAxis = at('offAxis', 0.7, 0.49);
		const result = nearestPoiInDirection([offAxis, onAxis], { x: 0.5, y: 0.5 }, 'up');
		expect(result?.id).toBe('onAxis');
	});

	it('returns null when nothing is ahead in that direction', () => {
		const pois = [at('south', 0.5, 0.9), at('east', 0.9, 0.5)];
		expect(nearestPoiInDirection(pois, { x: 0.5, y: 0.5 }, 'up')).toBeNull();
	});

	it('returns null for an empty POI list', () => {
		expect(nearestPoiInDirection([], { x: 0.5, y: 0.5 }, 'right')).toBeNull();
	});

	it('resolves left/right the same way as up/down', () => {
		const pois = [at('east', 0.8, 0.5), at('west', 0.2, 0.5)];
		expect(nearestPoiInDirection(pois, { x: 0.5, y: 0.5 }, 'right')?.id).toBe('east');
		expect(nearestPoiInDirection(pois, { x: 0.5, y: 0.5 }, 'left')?.id).toBe('west');
	});
});
