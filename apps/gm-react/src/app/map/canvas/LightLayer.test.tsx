import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { pointInRing, type MapFeature } from '@dndtools/core';
import { LightLayer, MAX_PLANNED_LIGHTS, planLighting } from './LightLayer';

/**
 * RC-MAP-3.6 — the lighting/LOS layer.
 *
 * Two halves, matching the two halves of the story's acceptance: the GEOMETRY (does a wall occlude a
 * light, does an open door let it through, do the bright/dim bands come out where 5e says they do)
 * asserted on the pure plan, and the VISUAL SNAPSHOT of the rendered SVG, so a change to the wash —
 * gradient stops, clip paths, the vision mask — has to be looked at rather than merged by accident.
 * The snapshot is stable because `planLighting` is pure and `idPrefix` pins the element ids.
 */

/** A room 0.1..0.9 split by a full-height wall at x = 0.5. */
const WALLS: MapFeature[] = [
	{
		id: 'w-outer',
		kind: 'wall',
		points: [
			{ x: 0.1, y: 0.1 },
			{ x: 0.9, y: 0.1 },
			{ x: 0.9, y: 0.9 },
			{ x: 0.1, y: 0.9 },
			{ x: 0.1, y: 0.1 },
		],
		style: 'wall:stone',
	},
	{
		id: 'w-divider',
		kind: 'wall',
		points: [
			{ x: 0.5, y: 0.1 },
			{ x: 0.5, y: 0.9 },
		],
		style: 'wall:stone',
	},
];

function light(id: string, x: number, y: number, props?: MapFeature['props']): MapFeature {
	return { id, kind: 'light', points: [{ x, y }], style: 'light:torch', props };
}

describe('planLighting', () => {
	it('clips a light to the side of the wall it stands on', () => {
		const plan = planLighting([...WALLS, light('l-1', 0.3, 0.5, { radius: 0.3 })]);
		expect(plan.active).toBe(true);
		expect(plan.lights).toHaveLength(1);
		expect(plan.occluders).toBe(2);

		const ring = plan.lights[0]!.ring;
		expect(pointInRing(ring, { x: 0.4, y: 0.5 })).toBe(true); // lit side
		expect(pointInRing(ring, { x: 0.7, y: 0.5 })).toBe(false); // behind the divider
	});

	it('lets an OPEN door through and a CLOSED one stop the light', () => {
		const walls: MapFeature[] = [
			WALLS[0]!,
			{
				...WALLS[1]!,
				id: 'w-upper',
				points: [
					{ x: 0.5, y: 0.1 },
					{ x: 0.5, y: 0.4 },
				],
			},
			{
				...WALLS[1]!,
				id: 'w-lower',
				points: [
					{ x: 0.5, y: 0.6 },
					{ x: 0.5, y: 0.9 },
				],
			},
		];
		const door = (state: string): MapFeature => ({
			id: 'd',
			kind: 'door',
			points: [
				{ x: 0.5, y: 0.4 },
				{ x: 0.5, y: 0.6 },
			],
			style: 'door:door',
			props: { portal: 'door', state },
		});
		const torch = light('l-1', 0.3, 0.5, { radius: 0.5 });

		const open = planLighting([...walls, door('open'), torch], { rays: 128 });
		const closed = planLighting([...walls, door('closed'), torch], { rays: 128 });

		expect(pointInRing(open.lights[0]!.ring, { x: 0.7, y: 0.5 })).toBe(true);
		expect(pointInRing(closed.lights[0]!.ring, { x: 0.7, y: 0.5 })).toBe(false);
	});

	it('defaults dim light to twice the bright radius and clamps a nonsensical one', () => {
		const plan = planLighting([
			light('l-1', 0.3, 0.5, { radius: 0.1 }),
			light('l-2', 0.4, 0.5, { radius: 0.1, dimRadius: 0.05 }),
			light('l-3', 0.6, 0.5, { radius: 0.1, dimRadius: 0.4 }),
		]);
		expect(plan.lights.map((l) => [l.brightRadius, l.dimRadius])).toEqual([
			[0.1, 0.2],
			[0.1, 0.1],
			[0.1, 0.4],
		]);
	});

	it('takes a colour only from a literal colour value, and falls back to a token otherwise', () => {
		const plan = planLighting([
			light('l-1', 0.3, 0.5, { color: '#ffd6aa' }),
			light('l-2', 0.4, 0.5, { color: 'url(#evil)' }),
			light('l-3', 0.5, 0.5, {}),
		]);
		expect(plan.lights.map((l) => l.color)).toEqual([
			'#ffd6aa',
			'var(--layer-player)',
			'var(--layer-player)',
		]);
	});

	it('caps the number of casts and says how many it skipped', () => {
		const many = Array.from({ length: MAX_PLANNED_LIGHTS + 5 }, (_, i) =>
			light(`l-${i}`, 0.2 + i * 0.01, 0.5),
		);
		const plan = planLighting(many);
		expect(plan.lights).toHaveLength(MAX_PLANNED_LIGHTS);
		expect(plan.omittedLights).toBe(5);
	});

	it('is inactive with no lights and no selected token', () => {
		const plan = planLighting(WALLS);
		expect(plan.active).toBe(false);
		expect(plan.vision).toBeNull();
	});

	it('previews what a selected token can see, occluded by the same walls', () => {
		const plan = planLighting(WALLS, { visionOrigin: { x: 0.3, y: 0.5 }, visionRadius: 0.4 });
		expect(plan.active).toBe(true);
		expect(pointInRing(plan.vision!.ring, { x: 0.45, y: 0.5 })).toBe(true);
		expect(pointInRing(plan.vision!.ring, { x: 0.7, y: 0.5 })).toBe(false);
	});

	it('is pure — the same features always give the same plan', () => {
		const features = [...WALLS, light('l-1', 0.3, 0.5, { radius: 0.2 })];
		expect(planLighting(features)).toEqual(planLighting(features));
	});
});

describe('LightLayer', () => {
	it('renders nothing when the plan is inactive', () => {
		const markup = renderToStaticMarkup(<LightLayer plan={planLighting(WALLS)} idPrefix="snap" />);
		expect(markup).toBe('');
	});

	it('matches the lighting + vision visual snapshot', () => {
		const plan = planLighting(
			[...WALLS, light('l-1', 0.3, 0.4, { radius: 0.08, color: '#ffd6aa', intensity: 0.8 })],
			{ visionOrigin: { x: 0.35, y: 0.6 }, visionRadius: 0.25, rays: 8 },
		);
		expect(renderToStaticMarkup(<LightLayer plan={plan} idPrefix="snap" />)).toMatchSnapshot();
	});
});
