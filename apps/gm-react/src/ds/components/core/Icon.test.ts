import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICON_REGISTRY, Icon } from './Icon.jsx';

describe('Icon registry', () => {
	const TestIcon = Icon as ComponentType<{ name: string }>;
	const registry = ICON_REGISTRY as Record<string, string>;

	it('resolves every reviewed semantic icon instead of the unknown-name fallback', () => {
		const fallback = renderToStaticMarkup(createElement(TestIcon, { name: '__not_registered__' }));
		for (const name of Object.keys(registry)) {
			expect(renderToStaticMarkup(createElement(TestIcon, { name })), name).not.toBe(fallback);
		}
	});

	it('keeps common action aliases on meaningful glyphs', () => {
		for (const name of [
			'arrow-right',
			'display',
			'download',
			'monster-claw',
			'note',
			'remove',
			'trash',
		]) {
			expect(registry[name]).toBeTruthy();
		}
	});
});
