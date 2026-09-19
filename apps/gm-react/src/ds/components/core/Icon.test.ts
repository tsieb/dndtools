import {
	BUILT_IN_SYSTEM_PACKAGES,
	STARTER_SYSTEM_LIBRARY,
	type SystemPackage,
} from '@dndtools/core';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICON_ALIASES, ICON_REGISTRY, Icon } from './Icon.jsx';

describe('Icon registry', () => {
	const TestIcon = Icon as ComponentType<{ name: string }>;
	const registry = ICON_REGISTRY as Record<string, string>;
	const aliases = ICON_ALIASES as Readonly<Record<string, string>>;

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

	// RC-DSN-3.2 — one concept, one glyph. Two keys may draw the same glyph only when ICON_ALIASES
	// says they are the same concept; anything else is a glyph that means two things.
	it('never gives two concepts the same glyph', () => {
		const conceptsByGlyph = new Map<string, string[]>();
		for (const [name, glyph] of Object.entries(registry)) {
			if (Object.hasOwn(aliases, name)) continue;
			conceptsByGlyph.set(glyph, [...(conceptsByGlyph.get(glyph) ?? []), name]);
		}
		const shared = [...conceptsByGlyph].filter(([, names]) => names.length > 1);
		expect(shared).toEqual([]);
	});

	it('keeps every alias on the glyph of a concept, never another alias', () => {
		for (const [alias, concept] of Object.entries(aliases)) {
			expect(Object.hasOwn(aliases, concept), `${alias} → ${concept} is an alias`).toBe(false);
			expect(registry[concept], `${alias} → ${concept} is not registered`).toBeTruthy();
			expect(registry[alias], alias).toBe(registry[concept]);
		}
	});

	it('names a face for every standard die', () => {
		for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
			expect(registry[`die-d${sides}`], `d${sides}`).toBeTruthy();
		}
	});

	it('gives each shipped package a distinct cond-<key> glyph per condition', () => {
		// 5e and Generic (built in) and the PF2e sample (starter library).
		const packages = [...BUILT_IN_SYSTEM_PACKAGES, ...STARTER_SYSTEM_LIBRARY] as SystemPackage[];
		expect(packages.length).toBeGreaterThanOrEqual(3);
		for (const pkg of packages) {
			const glyphs = pkg.conditions.map((condition) => {
				const glyph = registry[`cond-${condition.key}`];
				expect(glyph, `${pkg.id}: cond-${condition.key}`).toBeTruthy();
				return glyph;
			});
			expect(new Set(glyphs).size, pkg.id).toBe(glyphs.length);
		}
	});
});
