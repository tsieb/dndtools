import { describe, expect, it } from 'vitest';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	resolveUniqueLinkTargetId,
	resolveLinkTargetId,
} from './link-resolution.js';

describe('extractAliasesFromFrontmatter', () => {
	it('normalizes aliases from arrays and strings', () => {
		expect(extractAliasesFromFrontmatter({ aliases: ['  Waterdeep  ', 'City', 'City'] })).toEqual([
			'Waterdeep',
			'City',
		]);
		expect(extractAliasesFromFrontmatter({ aliases: 'The City of Splendors' })).toEqual([
			'The City of Splendors',
		]);
	});
});

describe('resolveLinkTargetId', () => {
	it('prefers exact title matches over aliases', () => {
		const resolved = resolveLinkTargetId('Moonrise', [
			{ id: 'a', title: 'Selune', updatedAt: '2026-01-01T00:00:00.000Z', aliases: ['Moonrise'] },
			{ id: 'b', title: 'Moonrise', updatedAt: '2025-01-01T00:00:00.000Z', aliases: [] },
		]);
		expect(resolved).toBe('b');
	});

	it('disambiguates by most recently updated note for tied matches', () => {
		const resolved = resolveLinkTargetId('Harbor Ward', [
			{
				id: 'old',
				title: 'Waterdeep Harbor',
				updatedAt: '2025-01-01T00:00:00.000Z',
				aliases: ['Harbor Ward'],
			},
			{
				id: 'new',
				title: 'Dockside',
				updatedAt: '2026-01-01T00:00:00.000Z',
				aliases: ['Harbor Ward'],
			},
		]);
		expect(resolved).toBe('new');
	});

	it('returns ordered candidates for ambiguous matches', () => {
		const candidates = resolveLinkCandidates('Neverwinter', [
			{ id: 'x', title: 'Neverwinter', updatedAt: '2025-01-01T00:00:00.000Z', aliases: [] },
			{
				id: 'y',
				title: 'Sword Coast City',
				updatedAt: '2026-01-01T00:00:00.000Z',
				aliases: ['Neverwinter'],
			},
		]);
		expect(candidates.map((entry) => `${entry.id}:${entry.matchedBy}`)).toEqual([
			'x:title',
			'y:alias',
		]);
		expect(candidates[1]?.matchedAlias).toBe('Neverwinter');
	});

	it('returns null when resolution is ambiguous and unique resolution is required', () => {
		const resolved = resolveUniqueLinkTargetId('Harbor Ward', [
			{
				id: 'old',
				title: 'Waterdeep Harbor',
				updatedAt: '2025-01-01T00:00:00.000Z',
				aliases: ['Harbor Ward'],
			},
			{
				id: 'new',
				title: 'Dockside',
				updatedAt: '2026-01-01T00:00:00.000Z',
				aliases: ['Harbor Ward'],
			},
		]);
		expect(resolved).toBeNull();
	});

	it('returns the id when there is exactly one candidate', () => {
		const resolved = resolveUniqueLinkTargetId('Waterdeep', [
			{
				id: 'city',
				title: 'City of Splendors',
				updatedAt: '2026-01-01T00:00:00.000Z',
				aliases: ['Waterdeep'],
			},
		]);
		expect(resolved).toBe('city');
	});
});
