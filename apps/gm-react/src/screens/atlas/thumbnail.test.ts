import { describe, expect, it } from 'vitest';
import type { ThumbnailModel } from '../../app/map/thumbnail';
import { renderThumbnail } from '../../app/map/thumbnail.worker';

function fixture(): ThumbnailModel {
	return {
		view: { fog: [], routes: [], pois: [] },
		layers: [
			{
				layerId: 'base',
				enabled: true,
				order: 0,
				opacity: 1,
				category: 'base',
				content: [
					{
						id: 'text',
						kind: 'text',
						points: [{ x: 0.2, y: 0.3 }],
						style: '',
						props: { text: '<script>alert("secret")</script>' },
					},
				],
			},
		],
		colors: { '--map-canvas-bg': 'black', '--layer-base': 'white', '--map-fog-fill': 'black' },
	} as unknown as ThumbnailModel;
}
const svg = (model: ThumbnailModel) =>
	decodeURIComponent(renderThumbnail(model).uri.split(',').slice(1).join(','));

describe('map thumbnails', () => {
	it('escapes text and omits disabled layer geometry', () => {
		const model = fixture();
		expect(svg(model)).toContain('&lt;script&gt;');
		expect(svg(model)).not.toContain('<script>');
		model.layers[0]!.enabled = false;
		expect(svg(model)).not.toContain('secret');
	});
	it('composes conceal/reveal fog in sequence order after geometry', () => {
		const model = fixture();
		model.view.fog = [
			{
				id: 'reveal',
				layerId: 'base',
				sequence: 2,
				kind: 'reveal',
				region: { shape: 'rect', x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
			},
			{
				id: 'conceal',
				layerId: 'base',
				sequence: 1,
				kind: 'conceal',
				region: { shape: 'rect', x: 0, y: 0, w: 1, h: 1 },
			},
		] as ThumbnailModel['view']['fog'];
		const rendered = svg(model);
		expect(rendered.indexOf('width="100" height="100" fill="white"')).toBeLessThan(
			rendered.indexOf('x="20" y="20" width="20"'),
		);
		expect(rendered.indexOf('<text')).toBeLessThan(rendered.indexOf('<mask'));
		expect(rendered).toContain('mask="url(#fog)"');
	});
	it('changes the data URI when geometry or theme changes', () => {
		const model = fixture();
		const before = svg(model);
		model.layers[0]!.content[0]!.points[0]!.x = 0.8;
		expect(svg(model)).not.toBe(before);
		const moved = svg(model);
		model.colors['--layer-base'] = 'red';
		expect(svg(model)).not.toBe(moved);
	});
});
