import { describe, expect, it } from 'vitest';
import {
	buildSceneOutline,
	outlineActivationAnnouncement,
	outlineItemName,
	type OutlineWidgetInput,
} from '../../src/lib/gui/a11y/scene-outline';
import { findLeakedTerms, type Viewer } from '../../src/lib/gui/a11y/visibility-boundary';

// UX-A11Y-004: the Scene Outline structural model. UX-A11Y-008: a player's outline never references a
// DM-only widget's name, type, or label.

const dm: Viewer = { role: 'dm', actorId: 'actor-dm' };
const player: Viewer = { role: 'player', actorId: 'actor-player' };

const widgets: OutlineWidgetInput[] = [
	{ id: 'w-note', type: 'note', name: 'Tavern brawl', layerOrder: 1, visibility: 'player-visible' },
	{ id: 'w-secret', type: 'trap', name: 'Pit of Doom', layerOrder: 0, visibility: 'dm-only' },
	{ id: 'w-map', type: 'map', name: 'Undermountain', layerOrder: 2, visibility: 'player-visible' },
];

describe('scene outline — outlineItemName (visibility-safe name)', () => {
	it('capitalises the type and appends a name when present', () => {
		expect(outlineItemName({ id: 'a', type: 'note', name: 'Quest log', layerOrder: 0, visibility: 'player-visible' })).toBe(
			'Note widget: Quest log',
		);
		expect(outlineItemName({ id: 'b', type: 'timer', layerOrder: 0, visibility: 'player-visible' })).toBe(
			'Timer widget',
		);
	});
});

describe('scene outline — buildSceneOutline', () => {
	it('orders by layer order and reports an ARIA position for each item (DM sees all)', () => {
		const model = buildSceneOutline(widgets, dm);
		expect(model.items.map((i) => i.id)).toEqual(['w-secret', 'w-note', 'w-map']);
		expect(model.items.map((i) => i.posinset)).toEqual([1, 2, 3]);
		expect(model.items.every((i) => i.setsize === 3)).toBe(true);
		expect(model.countLabel).toBe('3 widgets');
	});

	it('NO-LEAK: a player outline excludes the dm-only widget entirely', () => {
		const model = buildSceneOutline(widgets, player);
		expect(model.items.map((i) => i.id)).toEqual(['w-note', 'w-map']);
		expect(model.items.some((i) => i.id === 'w-secret')).toBe(false);
		expect(model.countLabel).toBe('2 widgets');
		// posinset/setsize reflect the FILTERED set, not the raw one
		expect(model.items.map((i) => i.setsize)).toEqual([2, 2]);
		// no produced string mentions the secret name or its type
		const blob = JSON.stringify(model);
		expect(findLeakedTerms(blob, ['Pit of Doom', 'trap'])).toEqual([]);
	});

	it('exposes the visibility label for the DM but the filtered set is player-safe', () => {
		const model = buildSceneOutline(widgets, dm);
		const secret = model.items.find((i) => i.id === 'w-secret');
		expect(secret?.visibilityLabel).toBe('DM only');
	});

	it('uses a tree role when any widget is grouped, listbox otherwise', () => {
		expect(buildSceneOutline(widgets, dm).role).toBe('listbox');
		const grouped = buildSceneOutline(
			[{ id: 'g', type: 'note', layerOrder: 0, visibility: 'player-visible', groupId: 'grp-1' }],
			dm,
		);
		expect(grouped.role).toBe('tree');
	});

	it('reports empty when no widgets exist for the viewer', () => {
		const model = buildSceneOutline([{ id: 'x', type: 'note', layerOrder: 0, visibility: 'dm-only' }], player);
		expect(model.empty).toBe(true);
		expect(model.filteredEmpty).toBe(false);
		expect(model.countLabel).toBe('No widgets');
	});

	it('filters by search and reports filtered-empty distinctly from empty', () => {
		const matched = buildSceneOutline(widgets, dm, { search: 'under' });
		expect(matched.items.map((i) => i.id)).toEqual(['w-map']);
		const none = buildSceneOutline(widgets, dm, { search: 'zzz' });
		expect(none.empty).toBe(false);
		expect(none.filteredEmpty).toBe(true);
		expect(none.countLabel).toBe('No widgets match filter');
	});

	it('a player search can never surface a dm-only widget even by its exact name', () => {
		const model = buildSceneOutline(widgets, player, { search: 'Pit of Doom' });
		expect(model.items).toHaveLength(0);
		// it was filtered by visibility before search, so this is filtered-empty over the 2 visible
		expect(model.filteredEmpty).toBe(true);
	});
});

describe('scene outline — activation announcement', () => {
	it('announces the focused widget by its accessible name', () => {
		expect(outlineActivationAnnouncement({ accessibleName: 'Map widget: Undermountain' })).toBe(
			'Focused Map widget: Undermountain on the canvas.',
		);
	});
});
