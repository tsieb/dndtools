import { describe, expect, it } from 'vitest';
import {
	BUILTIN_SCENE_TEMPLATES,
	DEFAULT_COMMAND_CENTER_NAME,
	DEFAULT_COMMAND_CENTER_TOOLS,
	type ScreenListEntry,
} from '@dndtools/core';
import { BOARD_RIGHT_BOUND } from '../../app/board-helpers';
import {
	BUILTIN_SCREEN_TEMPLATES,
	filterScreens,
	screenCanvasRoute,
	screenDisplayName,
	screenPath,
	screenTags,
	templateTiles,
	visibilityLabelKey,
} from './screenModel';

function entry(overrides: Partial<ScreenListEntry> & { id: string }): ScreenListEntry {
	return {
		name: overrides.id,
		description: '',
		tags: [],
		visibility: 'dm-only',
		updatedAt: '2026-09-01T00:00:00.000Z',
		layoutPolicy: 'canvas',
		pinned: false,
		pinOrder: null,
		origin: null,
		widgetCount: 0,
		isHome: false,
		isLive: false,
		...overrides,
	} as ScreenListEntry;
}

const nameOf = (e: ScreenListEntry) => screenDisplayName(e, 'GM screen');

describe('screenPath', () => {
	it('addresses one screen by its encoded id', () => {
		expect(screenPath('abc')).toBe('/screen/abc');
		expect(screenPath('a/b c')).toBe('/screen/a%2Fb%20c');
	});
});

describe('screenDisplayName', () => {
	it('names the untouched home board as the GM screen', () => {
		expect(
			screenDisplayName({ name: DEFAULT_COMMAND_CENTER_NAME, isHome: true }, 'DM screen'),
		).toBe('DM screen');
	});

	it('shows a name the GM chose, on the home board or anywhere else', () => {
		expect(screenDisplayName({ name: 'Table one', isHome: true }, 'DM screen')).toBe('Table one');
		expect(
			screenDisplayName({ name: DEFAULT_COMMAND_CENTER_NAME, isHome: false }, 'DM screen'),
		).toBe(DEFAULT_COMMAND_CENTER_NAME);
	});
});

describe('visibilityLabelKey', () => {
	it('names visibility, never an editorial status', () => {
		expect(visibilityLabelKey('dm-only')).toBe('common.visibility.dmOnly');
		expect(visibilityLabelKey('shared')).toBe('common.visibility.shared');
		expect(visibilityLabelKey('player-visible')).toBe('common.visibility.playerVisible');
	});
});

describe('filterScreens', () => {
	const screens = [
		entry({
			id: 'b',
			name: 'Bandit camp',
			tags: ['combat'],
			updatedAt: '2026-09-03T00:00:00.000Z',
		}),
		entry({
			id: 'a',
			name: 'Harbor',
			description: 'The docks at dusk',
			tags: ['town'],
			updatedAt: '2026-09-05T00:00:00.000Z',
		}),
		entry({
			id: 'c',
			name: 'Crypt',
			tags: ['combat', 'dungeon'],
			updatedAt: '2026-09-04T00:00:00.000Z',
		}),
	];

	it('keeps the core order under "pinned first"', () => {
		const shown = filterScreens(screens, { query: '', tag: '', sort: 'pinned' }, nameOf);
		expect(shown.map((s) => s.id)).toEqual(['b', 'a', 'c']);
	});

	it('matches the name, the description and the tags, case-insensitively', () => {
		const ids = (query: string) =>
			filterScreens(screens, { query, tag: '', sort: 'pinned' }, nameOf).map((s) => s.id);
		expect(ids('CRYPT')).toEqual(['c']);
		expect(ids('docks')).toEqual(['a']);
		expect(ids('dungeon')).toEqual(['c']);
		expect(ids('nothing like this')).toEqual([]);
	});

	it('filters by tag', () => {
		const shown = filterScreens(screens, { query: '', tag: 'combat', sort: 'pinned' }, nameOf);
		expect(shown.map((s) => s.id)).toEqual(['b', 'c']);
	});

	it('sorts by the shown name, and by newest change', () => {
		expect(
			filterScreens(screens, { query: '', tag: '', sort: 'name' }, nameOf).map((s) => s.id),
		).toEqual(['b', 'c', 'a']);
		expect(
			filterScreens(screens, { query: '', tag: '', sort: 'updated' }, nameOf).map((s) => s.id),
		).toEqual(['a', 'c', 'b']);
	});

	it('searches the home board under the name it is shown as', () => {
		const home = entry({ id: 'h', name: DEFAULT_COMMAND_CENTER_NAME, isHome: true });
		const ids = (query: string) =>
			filterScreens([home], { query, tag: '', sort: 'pinned' }, nameOf).map((s) => s.id);
		expect(ids('gm screen')).toEqual(['h']);
	});
});

describe('screenTags', () => {
	it('lists every tag once, sorted', () => {
		expect(
			screenTags([
				entry({ id: 'a', tags: ['town', 'combat'] }),
				entry({ id: 'b', tags: ['combat', 'dungeon'] }),
			]),
		).toEqual(['combat', 'dungeon', 'town']);
	});
});

describe('screenCanvasRoute', () => {
	it('gives the home screen the board surface and any other screen a scene surface', () => {
		expect(screenCanvasRoute('/screen/home', 'home')).toEqual({ kind: 'board' });
		expect(screenCanvasRoute('/screen/s%201', 'home')).toEqual({ kind: 'scene', sceneId: 's 1' });
	});

	it('is not a screen route anywhere else', () => {
		expect(screenCanvasRoute('/screens', 'home')).toBeNull();
		expect(screenCanvasRoute('/scene/abc', 'home')).toBeNull();
		expect(screenCanvasRoute('/screen/', 'home')).toBeNull();
		expect(screenCanvasRoute('/screen/%E0%A4%A', 'home')).toBeNull();
	});
});

describe('BUILTIN_SCREEN_TEMPLATES', () => {
	const byId = new Map(BUILTIN_SCREEN_TEMPLATES.map((template) => [template.id, template]));

	it('offers the run templates first, then every CAN-4.4 scene template', () => {
		expect(BUILTIN_SCREEN_TEMPLATES.slice(0, 5).map((t) => t.id)).toEqual([
			'command-center',
			'gm-screen',
			'session',
			'prep',
			'blank',
		]);
		for (const builtin of BUILTIN_SCENE_TEMPLATES) {
			const offered = BUILTIN_SCREEN_TEMPLATES.some(
				(template) =>
					template.source.kind === 'builtin' && template.source.templateId === builtin.id,
			);
			expect(offered, builtin.id).toBe(true);
		}
	});

	it('makes the Command Center a flow screen and the GM screen the home board’s tools', () => {
		expect(byId.get('command-center')?.layoutPolicy).toBe('flow');
		expect(byId.get('gm-screen')?.layoutPolicy).toBe('canvas');
		expect(templateTiles(byId.get('gm-screen')!).map((tile) => tile.type)).toEqual(
			DEFAULT_COMMAND_CENTER_TOOLS.map((tool) => tool.type),
		);
		expect(templateTiles(byId.get('blank')!)).toEqual([]);
	});

	it('keeps every canvas template inside the bounded board, without overlaps', () => {
		for (const template of BUILTIN_SCREEN_TEMPLATES) {
			if (template.layoutPolicy !== 'canvas') continue;
			const tiles = templateTiles(template);
			for (const tile of tiles)
				expect(tile.x + tile.w, `${template.id} ${tile.type}`).toBeLessThanOrEqual(
					BOARD_RIGHT_BOUND,
				);
			for (const [i, a] of tiles.entries())
				for (const b of tiles.slice(i + 1)) {
					const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
					expect(overlap, `${template.id}: ${a.type} overlaps ${b.type}`).toBe(false);
				}
		}
	});
});
