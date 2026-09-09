import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Kbd as RawKbd } from './Kbd.jsx';
const Kbd = RawKbd as React.ComponentType<{ children: React.ReactNode }>;
describe('Kbd', () => {
	it('renders shortcut text with keyboard semantics', () => {
		const html = renderToStaticMarkup(<Kbd>Ctrl+K</Kbd>);
		expect(html).toMatch(/^<kbd/);
		expect(html).toContain('Ctrl+K</kbd>');
	});
});
