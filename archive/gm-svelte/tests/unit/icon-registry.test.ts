import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	ICON_REGISTRY,
	ICON_SIZE_TOKEN,
	ICON_SIZES,
	STATUS_ICON,
	isIconName,
	resolveIconA11y,
	type StatusKind,
} from '../../src/lib/gui/icons';

// UX-VIS-009: the registry is the single icon source. These checks enforce the iconography contract
// without rendering: complete + defined registry, distinct status shapes (non-colour cue), the
// size-token map, the icon-only a11y rule, and traceability to the navigation registry icon ids.

const HERE = dirname(fileURLToPath(import.meta.url));

describe('icon registry (UX-VIS-009)', () => {
	it('maps every name to a defined Lucide component', () => {
		const entries = Object.entries(ICON_REGISTRY);
		expect(entries.length).toBeGreaterThan(0);
		for (const [name, component] of entries) {
			expect(component, name).toBeTruthy();
			expect(typeof component, name).toBe('function');
		}
	});

	it('exposes a size-token map for every named size (UX-VIS-009 size tokens)', () => {
		for (const size of ICON_SIZES) {
			const token = ICON_SIZE_TOKEN[size];
			expect(token, size).toMatch(/^--(icon-size-(micro|sm|md|lg|xl)|density-icon-size)$/);
		}
	});

	it('maps each status to a DISTINCT icon shape so state survives grayscale (AC2)', () => {
		const kinds: StatusKind[] = ['success', 'warning', 'error', 'info'];
		const components = kinds.map((k) => ICON_REGISTRY[STATUS_ICON[k]]);
		// Every status component is defined and unique (a different shape per severity).
		for (const [i, component] of components.entries()) {
			expect(component, kinds[i]).toBeTruthy();
		}
		expect(new Set(components).size).toBe(kinds.length);
	});

	it('uses the Eye glyph for the DM-only cue and a distinct hidden glyph', () => {
		expect(ICON_REGISTRY['dm-only']).toBeTruthy();
		expect(ICON_REGISTRY['hidden']).toBeTruthy();
		expect(ICON_REGISTRY['dm-only']).not.toBe(ICON_REGISTRY['hidden']);
	});

	it('guards unknown names (fail closed)', () => {
		expect(isIconName('home')).toBe(true);
		expect(isIconName('not-a-real-icon')).toBe(false);
	});

	it('AC1: resolveIconA11y gives a meaningful icon an accessible name', () => {
		expect(resolveIconA11y('Search')).toEqual({ role: 'img', 'aria-label': 'Search' });
		expect(resolveIconA11y('  Close dialog  ')).toEqual({
			role: 'img',
			'aria-label': 'Close dialog',
		});
	});

	it('AC1: resolveIconA11y hides a decorative icon (no/blank label) from the a11y tree', () => {
		expect(resolveIconA11y()).toEqual({ 'aria-hidden': 'true' });
		expect(resolveIconA11y('')).toEqual({ 'aria-hidden': 'true' });
		expect(resolveIconA11y('   ')).toEqual({ 'aria-hidden': 'true' });
	});

	it('covers every navigation-registry icon id (traceability)', () => {
		const registryYaml = readFileSync(
			resolve(HERE, '..', 'fixtures', 'navigation-registry.yaml'),
			'utf8',
		);
		const iconIds = [...registryYaml.matchAll(/^\s*icon:\s*([a-z0-9-]+)\s*$/gim)].map((m) => m[1]!);
		expect(iconIds.length).toBeGreaterThan(0);
		for (const id of iconIds) {
			expect(isIconName(id), `navigation icon "${id}" must exist in the icon registry`).toBe(true);
		}
	});
});
