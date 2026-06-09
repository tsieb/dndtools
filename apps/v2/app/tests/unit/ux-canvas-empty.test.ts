import { describe, expect, it } from 'vitest';
import { emptyCanvasContent } from '../../src/lib/gui/ux-canvas/empty-canvas';

// UX-CANVAS-013: the empty-canvas teaching state content.

describe('emptyCanvasContent', () => {
	it('provides a headline, CTA, secondary hints, a keyboard bar, and an SR announcement', () => {
		const content = emptyCanvasContent();
		expect(content.headline).toBe('Your scene is empty');
		expect(content.ctaLabel).toBe('Add your first widget');
		expect(content.hints.length).toBeGreaterThan(0);
		expect(content.keyboardHints).toContain('W — Add widget');
		expect(content.announcement).toContain('Scene empty');
	});

	it('drops the secondary callout annotations on compact profiles (UX-CANVAS-013 §Platform)', () => {
		const content = emptyCanvasContent({ compact: true });
		expect(content.hints).toEqual([]);
		// Headline, CTA, and the keyboard hint bar are retained on compact.
		expect(content.keyboardHints.length).toBeGreaterThan(0);
	});
});
