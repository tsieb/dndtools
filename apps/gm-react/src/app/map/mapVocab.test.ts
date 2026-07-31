import { describe, expect, it } from 'vitest';
import { TERRAIN_STYLES, bulkResultMessage, terrainColor } from './mapVocab';

// The brush, fill and room tools all write the chosen `terrain:*` id into `feature.style`, but the
// shared renderer (`FeatureShape`) only read the LAYER category colour — so all eight entries of the
// Terrain select, each showing its own swatch in the dropdown, painted the identical tint and painted
// lava was indistinguishable from painted snow.
describe('terrainColor', () => {
	it('resolves every id the Terrain select offers', () => {
		expect(TERRAIN_STYLES.length).toBeGreaterThan(1);
		for (const style of TERRAIN_STYLES) {
			expect(terrainColor(style.id), style.id).toBe(style.swatch);
		}
	});

	it('gives visually distinct paint to the palette entries', () => {
		const swatches = TERRAIN_STYLES.map((s) => terrainColor(s.id));
		expect(swatches).not.toContain(null);
		// EVERY entry distinct, not merely "more than one tint". The weaker assertion passed while
		// Forest and Grass painted identically: Forest referenced `--layer-terrain`, which was declared
		// nowhere, behind a `var(--layer-terrain, var(--layer-height))` fallback — and `--layer-height`
		// is exactly Grass's swatch. Eight labelled choices, seven appearances.
		expect(new Set(swatches).size, `duplicate terrain swatches: ${swatches.join(' | ')}`).toBe(
			TERRAIN_STYLES.length,
		);
	});

	it('references no fallback-less-token escape hatch that could hide a duplicate again', () => {
		// A `var(--x, <fallback>)` reference is invisible to styles/token-references.test.ts by design
		// (graceful degradation is legitimate), so it is exactly where an undeclared token hides. In this
		// palette a swatch must name ONE token and let that gate resolve it.
		for (const style of TERRAIN_STYLES) {
			expect(style.swatch, style.id).not.toMatch(/var\(\s*--[A-Za-z0-9-]+\s*,/);
		}
	});

	it('falls through for any non-terrain style so the layer colour still wins', () => {
		for (const style of ['', 'water', 'water:river', 'prop:crate', 'terrain:nope', undefined]) {
			expect(terrainColor(style), String(style)).toBeNull();
		}
	});
});

// The map Inspector's two bulk actions walk the selection one `run()` at a time and STOP on the first
// refusal (a locked layer, a permission ceiling). Both announced their verb unconditionally, so a DM
// whose delete was refused heard "Deleted 0 objects." — and `deleteAll` also cleared the selection,
// destroying the one state they could retry from after unlocking. Run #21 fixed exactly this shape in
// `keyboard.ts`'s `deleteSelection`; these are its sibling call sites.
describe('bulkResultMessage', () => {
	it('names a single object in the singular', () => {
		expect(
			bulkResultMessage({
				done: 1,
				attempted: 1,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		).toBe('Deleted 1 object.');
	});

	it('pluralises a multi-object result', () => {
		expect(
			bulkResultMessage({
				done: 3,
				attempted: 3,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		).toBe('Deleted 3 objects.');
	});

	it('never claims success when every command was refused', () => {
		const message = bulkResultMessage({
			done: 0,
			attempted: 4,
			template: 'Deleted {objects}.',
			refusedVerb: 'deleted',
		});
		expect(message).not.toMatch(/Deleted/);
		expect(message).toMatch(/locked layer/);
	});

	it('reports a partial result as partial rather than as a clean success', () => {
		expect(
			bulkResultMessage({
				done: 2,
				attempted: 5,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		).toBe('Deleted 2 objects — the rest were refused.');
	});

	it('carries the same guarantees for the visibility action', () => {
		expect(
			bulkResultMessage({
				done: 1,
				attempted: 1,
				template: 'Set {objects} to DM only.',
				refusedVerb: 'changed',
			}),
		).toBe('Set 1 object to DM only.');
		expect(
			bulkResultMessage({
				done: 0,
				attempted: 2,
				template: 'Set {objects} to DM only.',
				refusedVerb: 'changed',
			}),
		).toBe('Nothing was changed — the selection may be on a locked layer.');
	});

	it('says nothing at all when there was no selection to act on', () => {
		expect(
			bulkResultMessage({
				done: 0,
				attempted: 0,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		).toBe('');
	});
});
