import { describe, expect, it } from 'vitest';
import { normalizeObjectRelationships } from '$lib/domain/objects.js';

describe('normalizeObjectRelationships', () => {
	it('keeps built-in relationship types', () => {
		const normalized = normalizeObjectRelationships([
			{ type: 'ally', targetId: 'obj-1', description: 'Trusted contact' },
		]);
		expect(normalized).toEqual([
			{ type: 'ally', targetId: 'obj-1', sessionId: undefined, description: 'Trusted contact' },
		]);
	});

	it('supports explicit custom relationship labels', () => {
		const normalized = normalizeObjectRelationships([
			{ type: 'custom', label: 'mentor', targetId: 'obj-2' },
		]);
		expect(normalized).toEqual([
			{ type: 'custom', label: 'mentor', targetId: 'obj-2', sessionId: undefined, description: undefined },
		]);
	});

	it('maps unknown relationship types into custom labels', () => {
		const normalized = normalizeObjectRelationships([{ type: 'rival', targetId: 'obj-3' }]);
		expect(normalized).toEqual([
			{ type: 'custom', label: 'rival', targetId: 'obj-3', sessionId: undefined, description: undefined },
		]);
	});

	it('rejects custom relationships without labels', () => {
		const normalized = normalizeObjectRelationships([{ type: 'custom', targetId: 'obj-4' }]);
		expect(normalized).toEqual([]);
	});
});
