import { describe, expect, it } from 'vitest';
import {
	filterMonsters,
	filterSpells,
	loadBundledMonsters,
	loadBundledSpells,
	searchBundledMonsters,
	searchBundledSpells,
	DEFAULT_PAGE_LIMIT,
} from './srd';

// The bundled dataset is the REAL asset (dynamic-imported, same code path as the app): these
// tests double as a contract check that the shipped JSON keeps the envelope + entry shape the
// Compendium UI depends on.

describe('bundled SRD envelopes', () => {
	it('monsters: CC-BY-4.0 envelope with attribution and matching entry count', async () => {
		const env = await loadBundledMonsters();
		expect(env.license).toBe('CC-BY-4.0');
		expect(env.attribution).toContain('System Reference Document 5.1');
		expect(env.kind).toBe('monsters');
		expect(env.entries.length).toBe(env.count);
		expect(env.entries.length).toBeGreaterThan(300);
		const first = env.entries[0];
		expect(typeof first.key).toBe('string');
		expect(typeof first.name).toBe('string');
		expect(typeof first.cr).toBe('number');
	});

	it('spells: CC-BY-4.0 envelope with required entry fields', async () => {
		const env = await loadBundledSpells();
		expect(env.license).toBe('CC-BY-4.0');
		expect(env.attribution).toContain('Creative Commons Attribution 4.0');
		expect(env.entries.length).toBe(env.count);
		const first = env.entries[0];
		expect(typeof first.name).toBe('string');
		expect(typeof first.level).toBe('number');
		expect(typeof first.desc).toBe('string');
	});

	it('memoizes the load (same promise both times)', () => {
		expect(loadBundledMonsters()).toBe(loadBundledMonsters());
	});
});

describe('filterMonsters', () => {
	it('matches name substrings case-insensitively', async () => {
		const { entries } = await loadBundledMonsters();
		const hits = filterMonsters(entries, { search: 'gOBlin' });
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.every((m) => m.name.toLowerCase().includes('goblin'))).toBe(true);
		expect(hits.some((m) => m.name === 'Goblin')).toBe(true);
	});

	it('filters by exact (fractional) CR', async () => {
		const { entries } = await loadBundledMonsters();
		const hits = filterMonsters(entries, { cr: 0.25 });
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.every((m) => m.cr === 0.25)).toBe(true);
	});

	it('combines search + CR and returns [] honestly when nothing matches', async () => {
		const { entries } = await loadBundledMonsters();
		const hits = filterMonsters(entries, { search: 'dragon', cr: 0.25 });
		expect(hits.every((m) => m.cr === 0.25 && m.name.toLowerCase().includes('dragon'))).toBe(true);
		expect(filterMonsters(entries, { search: 'goblin', cr: 30 })).toEqual([]);
		expect(filterMonsters(entries, { search: 'zzz-not-a-monster' })).toEqual([]);
	});
});

describe('filterSpells', () => {
	it('filters by exact level (0 = cantrip)', async () => {
		const { entries } = await loadBundledSpells();
		const cantrips = filterSpells(entries, { level: 0 });
		expect(cantrips.length).toBeGreaterThan(0);
		expect(cantrips.every((s) => s.level === 0)).toBe(true);
	});

	it('combines search + level', async () => {
		const { entries } = await loadBundledSpells();
		const hits = filterSpells(entries, { search: 'fire', level: 3 });
		expect(hits.some((s) => s.name === 'Fireball')).toBe(true);
		expect(hits.every((s) => s.level === 3 && s.name.toLowerCase().includes('fire'))).toBe(true);
	});
});

describe('searchBundled*', () => {
	it('returns the source-agnostic result shape marked bundled, with the envelope attribution', async () => {
		const result = await searchBundledMonsters({ search: 'goblin' });
		expect(result.source).toBe('bundled');
		expect(result.license).toBe('CC-BY-4.0');
		expect(result.attribution).toContain('Wizards of the Coast');
		expect(result.total).toBe(result.entries.length); // small match set — no truncation
	});

	it('caps one page at the query limit but reports the full total', async () => {
		const result = await searchBundledSpells({ limit: 5 });
		expect(result.entries.length).toBe(5);
		expect(result.total).toBeGreaterThan(300);
	});

	it('applies the default page limit when none is given', async () => {
		const result = await searchBundledMonsters({});
		expect(result.entries.length).toBe(DEFAULT_PAGE_LIMIT);
		expect(result.total).toBeGreaterThan(DEFAULT_PAGE_LIMIT);
	});
});
