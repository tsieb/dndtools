import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Figure as RawFigure } from './Figure.jsx';
const Figure = RawFigure as React.ComponentType<Record<string, unknown>>;
describe('Figure', () => {
	it('renders an image with alternative text and a caption', () => {
		const html = renderToStaticMarkup(
			<Figure src="/cover.png" alt="Forest at dawn" caption="Scene cover" />,
		);
		expect(html).toMatch(/^<figure/);
		expect(html).toContain('alt="Forest at dawn"');
		expect(html).toContain('<figcaption');
		expect(html).toContain('Scene cover</figcaption>');
	});
});
