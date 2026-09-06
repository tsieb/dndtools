import { describe, expect, it } from 'vitest';
import {
	getProp,
	PROP_CATALOG,
	PROP_CATEGORIES,
	propsInCategory,
	searchProps,
	type PropCategoryId,
} from '../src/generation/props';
import { OBJECT_KIND_IDS, scatterPropsGenerator } from '../src/generation/scatter';
import { resolveParams, type GeneratorContext } from '../src/generation/types';
import { createRngStreams } from '../src/state/prng';

/**
 * RC-MAP-3.1 — the prop catalogue is DATA, and data that two subsystems read has to be pinned:
 * the Assets panel stamps a `prop` feature whose `style` is a catalogue id, the scatter generators
 * emit `prop` features with the same ids, and the renderer looks the glyph up by that id. A silent
 * rename or a missing glyph therefore turns props back into anonymous dots — the exact defect this
 * story fixed — so the snapshot below is the contract, not decoration.
 */
describe('prop catalogue', () => {
	it('is a stable, snapshotted set of ids per category', () => {
		const byCategory = Object.fromEntries(
			PROP_CATEGORIES.map((c) => [c, propsInCategory(c).map((e) => e.id)]),
		);
		expect(byCategory).toMatchInlineSnapshot(`
			{
			  "doors": [
			    "prop:door-frame",
			    "prop:double-doors",
			    "prop:secret-panel",
			    "prop:portcullis",
			  ],
			  "foliage": [
			    "prop:tree",
			    "prop:pine",
			    "prop:bush",
			    "prop:dead-tree",
			    "prop:mushroom",
			    "prop:grass",
			  ],
			  "furniture": [
			    "prop:table",
			    "prop:chair",
			    "prop:bed",
			    "prop:bookshelf",
			    "prop:crate",
			    "prop:barrel",
			    "prop:altar",
			  ],
			  "light": [
			    "prop:brazier",
			    "prop:campfire",
			    "prop:torch",
			    "prop:chandelier",
			  ],
			  "rubble": [
			    "prop:rock",
			    "prop:rubble",
			    "prop:bone",
			    "prop:stalagmite",
			    "prop:grave",
			  ],
			  "stairs": [
			    "prop:stairs-up",
			    "prop:stairs-down",
			    "prop:spiral-stairs",
			    "prop:ladder",
			  ],
			  "structure": [
			    "prop:pillar",
			    "prop:statue",
			    "prop:well",
			    "prop:fountain",
			  ],
			  "treasure": [
			    "prop:chest",
			    "prop:coins",
			    "prop:gem",
			    "prop:urn",
			  ],
			}
		`);
	});

	it('gives every entry a unique id, a catalogued category and a non-empty vector glyph', () => {
		const ids = new Set<string>();
		for (const entry of PROP_CATALOG) {
			expect(ids.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
			ids.add(entry.id);
			expect(entry.id.startsWith('prop:')).toBe(true);
			expect(PROP_CATEGORIES).toContain(entry.category);
			expect(entry.name.length).toBeGreaterThan(0);
			// A glyph is filled path data in the -1..1 box: it must start with a moveto and close.
			expect(entry.glyph.startsWith('M')).toBe(true);
			expect(entry.glyph).toContain('Z');
			expect(entry.defaultScale).toBeGreaterThan(0);
			expect(entry.defaultScale).toBeLessThanOrEqual(2);
		}
		expect(PROP_CATALOG.length).toBe(ids.size);
	});

	it('keeps every glyph inside the -1..1 box, so a stamp never bleeds past its own footprint', () => {
		for (const entry of PROP_CATALOG) {
			const box = glyphBounds(entry.glyph);
			expect(box.minX, `${entry.id} bleeds left`).toBeGreaterThanOrEqual(-1.001);
			expect(box.minY, `${entry.id} bleeds up`).toBeGreaterThanOrEqual(-1.001);
			expect(box.maxX, `${entry.id} bleeds right`).toBeLessThanOrEqual(1.001);
			expect(box.maxY, `${entry.id} bleeds down`).toBeLessThanOrEqual(1.001);
			// And it is not a degenerate speck: a glyph has to be big enough to read as an object.
			expect(box.maxX - box.minX, `${entry.id} is too narrow to see`).toBeGreaterThan(0.3);
			expect(box.maxY - box.minY, `${entry.id} is too short to see`).toBeGreaterThan(0.3);
		}
	});

	it('stocks every style the scatter generator can emit', () => {
		// Every object kind the Scatter tool offers, run for real: a kind whose style the catalogue does
		// not stock renders as an anonymous dot on the finished map.
		for (const object of OBJECT_KIND_IDS) {
			const resolved = resolveParams(scatterPropsGenerator, { object, density: 0.6 });
			if ('error' in resolved) throw new Error(`unexpected param error: ${resolved.error.message}`);
			const ctx: GeneratorContext = {
				params: resolved.params,
				rng: createRngStreams('prop-catalogue'),
				idPrefix: 'gen1',
				visibility: 'dm-only',
				stamp: { actorId: 'actor-dm', now: '2026-09-06T00:00:00.000Z' },
			};
			const props = scatterPropsGenerator
				.run(ctx)
				.layers.flatMap((layer) => layer.content)
				.filter((feature) => feature.kind === 'prop');
			expect(props.length, `${object} scattered nothing`).toBeGreaterThan(0);
			for (const feature of props) {
				expect(getProp(feature.style), `uncatalogued style ${feature.style}`).toBeDefined();
			}
		}
	});

	it('searches name, id, category and tags, and returns everything for an empty query', () => {
		expect(searchProps('  ')).toHaveLength(PROP_CATALOG.length);
		expect(searchProps('chair').map((e) => e.id)).toEqual(['prop:chair']);
		expect(searchProps('treasure').map((e) => e.id)).toContain('prop:chest');
		expect(searchProps('stairs').map((e) => e.id)).toContain('prop:spiral-stairs');
		expect(searchProps('ZZZ-nothing')).toHaveLength(0);
	});

	it('resolves an unknown or missing id to undefined rather than a stand-in glyph', () => {
		expect(getProp(undefined)).toBeUndefined();
		expect(getProp('prop:not-stocked')).toBeUndefined();
		expect(getProp('prop:chest')?.category).toBe<PropCategoryId>('treasure');
	});
});

/**
 * Bounds of a glyph path, over the command subset the catalogue authors with (`M L h v A Z`).
 *
 * Arcs are the only interesting case: a circle is written as two semicircular arcs, whose extremes sit
 * halfway along the arc rather than at either endpoint. The bulge is perpendicular to the chord by the
 * arc's sagitta, so the walker adds those two points rather than expanding the chord box in both axes
 * (which would report a circle as half again as tall as it is).
 */
function glyphBounds(path: string): { minX: number; minY: number; maxX: number; maxY: number } {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const see = (x: number, y: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};
	let cx = 0;
	let cy = 0;
	for (const [, command, rest] of path.matchAll(/([MLAhvZz])([^MLAhvZz]*)/g)) {
		const n = ((rest ?? '').match(/-?\d*\.?\d+/g) ?? []).map(Number);
		if (command === 'M' || command === 'L') {
			for (let i = 0; i + 1 < n.length; i += 2) {
				cx = n[i]!;
				cy = n[i + 1]!;
				see(cx, cy);
			}
		} else if (command === 'h') {
			cx += n[0] ?? 0;
			see(cx, cy);
		} else if (command === 'v') {
			cy += n[0] ?? 0;
			see(cx, cy);
		} else if (command === 'A') {
			const [rx = 0, , , largeArc = 0, , ex = cx, ey = cy] = n;
			const dx = ex - cx;
			const dy = ey - cy;
			const chord = Math.hypot(dx, dy);
			if (chord > 0) {
				const half = Math.min(chord / 2, rx);
				const inner = rx - Math.sqrt(Math.max(0, rx * rx - half * half));
				const sagitta = largeArc === 1 ? 2 * rx - inner : inner;
				const nx = -dy / chord;
				const ny = dx / chord;
				see(cx + dx / 2 + nx * sagitta, cy + dy / 2 + ny * sagitta);
				see(cx + dx / 2 - nx * sagitta, cy + dy / 2 - ny * sagitta);
			}
			cx = ex;
			cy = ey;
			see(cx, cy);
		}
	}
	return { minX, minY, maxX, maxY };
}
