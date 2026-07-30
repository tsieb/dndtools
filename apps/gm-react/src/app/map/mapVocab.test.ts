import { describe, expect, it } from 'vitest';
import { TERRAIN_STYLES, terrainColor } from './mapVocab';

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
		const swatches = new Set(TERRAIN_STYLES.map((s) => terrainColor(s.id)));
		// Not one shared tint: the control has to change what the canvas looks like.
		expect(swatches.size).toBeGreaterThan(1);
		expect(swatches.has(null)).toBe(false);
	});

	it('falls through for any non-terrain style so the layer colour still wins', () => {
		for (const style of ['', 'water', 'water:river', 'prop:crate', 'terrain:nope', undefined]) {
			expect(terrainColor(style), String(style)).toBeNull();
		}
	});
});
