import { describe, expect, it } from 'vitest';
import { canvasSurfaceProps, OPERATION_TEXT } from './surfaceA11y';

// RC-POL-1.2: the names come from the catalogs, so the surface says "DM screen" with the rest of the
// app's vocabulary (it said "GM Screen" while every other label said DM).
describe('canvas surface screen-reader contract (RC-UX-2.2)', () => {
	it('is a labelled region while viewing and an application only while editing', () => {
		expect(canvasSurfaceProps('bounded', false, 6)).toEqual({
			role: 'region',
			'aria-label': 'DM screen, 6 widgets',
		});
		expect(canvasSurfaceProps('bounded', true, 6)).toEqual({
			role: 'application',
			'aria-label': 'DM screen layout editor, 6 widgets',
		});
		expect(canvasSurfaceProps('canvas', false, 2)['aria-label']).toBe('Scene canvas, 2 widgets');
		expect(canvasSurfaceProps('flow', true, 3)['aria-label']).toBe(
			'Scene layout editor, 3 widgets',
		);
	});

	it('counts in the singular and the plural', () => {
		expect(canvasSurfaceProps('flow', false, 0)['aria-label']).toBe('Scene layout, 0 widgets');
		expect(canvasSurfaceProps('flow', false, 1)['aria-label']).toBe('Scene layout, 1 widget');
	});

	it('keeps the resize wording the existing announcement tests pin', () => {
		expect(OPERATION_TEXT.resized('Torchlight', 340, 220)).toBe('Torchlight, size 340 by 220');
		expect(OPERATION_TEXT.moved('Timer', 24, 48)).toBe('Timer, moved to 24, 48');
	});
});
