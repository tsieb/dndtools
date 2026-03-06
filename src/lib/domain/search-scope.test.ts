import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SEARCH_SCOPE,
	applySearchScopeToQuery,
	describeSearchScope,
	matchesSearchScope,
	normalizeSearchScope,
	parseSearchScopeFromParams,
	writeSearchScopeToParams,
} from './search-scope.js';

describe('search scope helpers', () => {
	it('normalizes folder and type scopes', () => {
		expect(normalizeSearchScope({ kind: 'folder', value: 'campaign/npcs' })).toEqual({
			kind: 'folder',
			value: '/campaign/npcs',
		});
		expect(normalizeSearchScope({ kind: 'type', value: ' NPC ' })).toEqual({
			kind: 'type',
			value: 'npc',
		});
	});

	it('falls back to all scope when invalid', () => {
		expect(normalizeSearchScope({ kind: 'folder', value: '' })).toEqual(DEFAULT_SEARCH_SCOPE);
		expect(normalizeSearchScope({ kind: 'all', value: 'ignored' })).toEqual(DEFAULT_SEARCH_SCOPE);
	});

	it('parses and writes URL params', () => {
		const params = new URLSearchParams('q=welcome&scope=folder&scopeValue=%2Fworld');
		expect(parseSearchScopeFromParams(params)).toEqual({ kind: 'folder', value: '/world' });

		const next = new URLSearchParams('q=welcome');
		writeSearchScopeToParams(next, { kind: 'type', value: 'npc' });
		expect(next.toString()).toContain('scope=type');
		expect(next.toString()).toContain('scopeValue=npc');

		writeSearchScopeToParams(next, DEFAULT_SEARCH_SCOPE);
		expect(next.get('scope')).toBeNull();
		expect(next.get('scopeValue')).toBeNull();
	});

	it('applies scope operators to queries', () => {
		expect(applySearchScopeToQuery('goblin', { kind: 'folder', value: '/campaign' })).toBe(
			'folder:/campaign goblin',
		);
		expect(applySearchScopeToQuery('', { kind: 'type', value: 'npc' })).toBe('type:npc');
		expect(applySearchScopeToQuery('goblin', DEFAULT_SEARCH_SCOPE)).toBe('goblin');
	});

	it('matches targets against scope', () => {
		expect(
			matchesSearchScope(
				{ folder: '/campaign/npcs', type: 'npc' },
				{ kind: 'folder', value: '/campaign' },
			),
		).toBe(true);
		expect(
			matchesSearchScope({ folder: '/world', type: 'location' }, { kind: 'type', value: 'npc' }),
		).toBe(false);
	});

	it('describes user-facing scope labels', () => {
		expect(describeSearchScope(DEFAULT_SEARCH_SCOPE)).toBe('Searching all notes');
		expect(describeSearchScope({ kind: 'folder', value: '/locations' })).toBe(
			'Searching in /locations',
		);
		expect(describeSearchScope({ kind: 'type', value: 'npc' })).toBe('Searching NPCs only');
	});
});
