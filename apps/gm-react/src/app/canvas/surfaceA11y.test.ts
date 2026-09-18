import { describe, expect, it } from 'vitest';
import { canvasSurfaceProps, OPERATION_TEXT, widgetCount } from './surfaceA11y';

describe('canvas surface screen-reader contract (RC-UX-2.2)', () => {
	it('is a labelled region while viewing and an application only while editing', () => {
		expect(canvasSurfaceProps('bounded', false, 6)).toEqual({
			role: 'region',
			'aria-label': 'GM Screen, 6 widgets',
		});
		expect(canvasSurfaceProps('bounded', true, 6)).toEqual({
			role: 'application',
			'aria-label': 'GM Screen layout editor, 6 widgets',
		});
		expect(canvasSurfaceProps('canvas', false, 2)['aria-label']).toBe('Scene canvas, 2 widgets');
		expect(canvasSurfaceProps('flow', true, 3)['aria-label']).toBe(
			'Scene layout editor, 3 widgets',
		);
	});

	it('counts in the singular and the plural', () => {
		expect(widgetCount(0)).toBe('0 widgets');
		expect(widgetCount(1)).toBe('1 widget');
		expect(canvasSurfaceProps('flow', false, 1)['aria-label']).toBe('Scene layout, 1 widget');
	});

	it('keeps the resize wording the existing announcement tests pin', () => {
		expect(OPERATION_TEXT.resized('Torchlight', 340, 220)).toBe('Torchlight, size 340 by 220');
		expect(OPERATION_TEXT.moved('Timer', 24, 48)).toBe('Timer, moved to 24, 48');
	});
});
