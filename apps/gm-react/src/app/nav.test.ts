import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/messages/en';
import { LOCAL_ENTRIES, PRIMARY, ROUTE_OWNERS, routeOwner, TOOLS } from './nav';
import { MORE_SECTIONS, PHONE_TABS } from './shell/sections';

/** The `<Route path>` strings inside App.tsx's `ShelledRoutes` — the shell's content routes. */
function shelledRoutePaths(): string[] {
	const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
	const start = source.indexOf('function ShelledRoutes()');
	const end = source.indexOf('</Routes>', start);
	expect(start).toBeGreaterThan(-1);
	return [...source.slice(start, end).matchAll(/<Route\s+path="([^"]+)"/g)]
		.map((match) => match[1]!)
		.filter((path) => path !== '*');
}

describe('IA-1 primary sections (RC-ENG-15.1, ADR-013)', () => {
	it('configures exactly six primary sections, in order', () => {
		expect(PRIMARY).toHaveLength(6);
		expect(PRIMARY.map((s) => en[s.labelKey])).toEqual([
			'Screens',
			'Characters',
			'Maps',
			'Story',
			'Notes',
			'Tools',
		]);
		expect(new Set(PRIMARY.map((s) => s.id)).size).toBe(6);
	});

	it('gives every shelled content route exactly one owner', () => {
		const routes = shelledRoutePaths();
		expect(routes.length).toBeGreaterThan(20);
		const owned = ROUTE_OWNERS.map(([path]) => path);
		expect(new Set(owned).size).toBe(owned.length);
		expect([...owned].sort()).toEqual([...routes].sort());
		const owners = new Set<string>([...PRIMARY.map((s) => s.id), 'settings']);
		for (const [, owner] of ROUTE_OWNERS) expect(owners.has(owner)).toBe(true);
	});

	it('resolves concrete paths to their one owning section', () => {
		const cases: Array<[string, string | null]> = [
			['/', 'screens'],
			['/board', 'screens'],
			['/session', 'screens'],
			['/screens', 'screens'],
			['/screen/abc', 'screens'],
			['/scene/abc', 'screens'],
			['/characters', 'characters'],
			['/characters/c-1', 'characters'],
			['/player', 'characters'],
			['/atlas', 'atlas'],
			['/campaign/calendar', 'campaign'],
			['/knowledge/n-1', 'knowledge'],
			['/graph/repair', 'knowledge'],
			['/tools', 'tools'],
			['/audio', 'tools'],
			['/extensions', 'tools'],
			['/community', 'tools'],
			['/upgrade', 'settings'],
			['/settings', 'settings'],
			['/play', null],
			['/nowhere', null],
		];
		for (const [path, owner] of cases) expect([path, routeOwner(path)]).toEqual([path, owner]);
		for (const section of PRIMARY) expect(routeOwner(section.path)).toBe(section.id);
	});

	it('keeps local pages and tools under the section that owns their route', () => {
		for (const [owner, entries] of Object.entries(LOCAL_ENTRIES))
			for (const entry of entries ?? []) expect(routeOwner(entry.path)).toBe(owner);
		expect(TOOLS.map((s) => s.path)).toEqual(['/audio', '/extensions', '/community']);
		for (const tool of TOOLS) expect(routeOwner(tool.path)).toBe('tools');
	});

	it('puts Screens, Characters and Maps on the phone tab bar and the rest in More', () => {
		expect(PHONE_TABS.map((s) => s.id)).toEqual(['screens', 'characters', 'atlas']);
		expect([...PHONE_TABS, ...MORE_SECTIONS]).toEqual(PRIMARY);
	});
});
