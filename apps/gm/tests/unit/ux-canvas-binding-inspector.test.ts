import { describe, expect, it } from 'vitest';
import {
	bindingTypesFor,
	buildBinding,
	currentBindingSummary,
	filterEntities,
	type BindableEntity,
} from '../../src/lib/gui/ux-canvas/binding-inspector';

// UX-CANVAS-008: the discrete "Bind to entity…" model — the WCAG 2.5.7 alternative to the anchor drag.

const ENTITIES: BindableEntity[] = [
	{ entityType: 'character', entityId: 'char-mira', label: 'Mira' },
	{ entityType: 'character', entityId: 'char-bran', label: 'Bran' },
	{ entityType: 'scene', entityId: 'scene-keep', label: 'The Keep' },
];

describe('bindingTypesFor', () => {
	it('returns the widget package types, defaulting to a generic summary', () => {
		expect(bindingTypesFor('character').map((t) => t.selector)).toContain('character.hp');
		expect(bindingTypesFor('note').map((t) => t.selector)).toEqual(['note.content']);
		expect(bindingTypesFor('mystery')).toEqual([{ selector: 'entity.summary', label: 'Summary' }]);
	});
});

describe('filterEntities', () => {
	it('matches label, id, and type case-insensitively and sorts by label', () => {
		expect(filterEntities(ENTITIES, '').map((e) => e.label)).toEqual(['Bran', 'Mira', 'The Keep']);
		expect(filterEntities(ENTITIES, 'mir').map((e) => e.entityId)).toEqual(['char-mira']);
		expect(filterEntities(ENTITIES, 'scene').map((e) => e.entityId)).toEqual(['scene-keep']);
	});

	it('returns nothing for a non-matching query', () => {
		expect(filterEntities(ENTITIES, 'zzz')).toEqual([]);
	});
});

describe('buildBinding', () => {
	it('builds a read-only viewer binding with an optional selector', () => {
		const binding = buildBinding(ENTITIES[0]!, 'character.hp');
		expect(binding).toEqual({
			source: { entityType: 'character', entityId: 'char-mira', selector: 'character.hp' },
			mode: 'read',
			requiredCapability: 'viewer',
		});
	});

	it('omits a blank selector', () => {
		const binding = buildBinding(ENTITIES[0]!, '   ');
		expect(binding.source).not.toHaveProperty('selector');
	});
});

describe('currentBindingSummary', () => {
	it('summarises an existing binding, and returns null when unbound', () => {
		expect(currentBindingSummary(null)).toBeNull();
		expect(
			currentBindingSummary({
				source: { entityType: 'character', entityId: 'char-mira', selector: 'character.hp' },
				mode: 'read',
				requiredCapability: 'viewer',
			}),
		).toEqual({ entityType: 'character', entityId: 'char-mira', selector: 'character.hp' });
	});
});
