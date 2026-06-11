import { describe, expect, it } from 'vitest';
import type { NavigationCrumb } from '@dndtools/core';
import {
	MAX_VISIBLE_CRUMBS,
	buildBreadcrumbView,
	buildCompactBreadcrumbView,
} from '../../src/lib/gui/ux-shell/breadcrumb-model';

// UX-NAV-007 — the breadcrumb presentation model: location-style trail shown at the second
// level and deeper, collapsing a deep middle to `Section › … › Parent › Current` on the full
// surface and truncating to `‹ <immediate parent>` (full path in a sheet) on compact.

function crumb(id: string, current = false): NavigationCrumb {
	return { id, title: id.replace(/^\w/, (c) => c.toUpperCase()), route: `/${id}/`, current };
}

describe('UX-NAV-007 buildBreadcrumbView (full trail)', () => {
	it('shows every crumb in order when the trail fits within the cap', () => {
		const crumbs = [crumb('knowledge'), crumb('lore'), crumb('the-sunken-city', true)];
		const view = buildBreadcrumbView(crumbs);
		expect(view.isCollapsed).toBe(false);
		expect(view.leading.map((c) => c.id)).toEqual(['knowledge', 'lore', 'the-sunken-city']);
		expect(view.collapsed).toEqual([]);
		expect(view.trailing).toEqual([]);
		// AC2: the current item is the last crumb (the component marks it aria-current).
		expect(view.leading.at(-1)?.current).toBe(true);
	});

	it('keeps exactly the cap of crumbs without collapsing', () => {
		const crumbs = [crumb('a'), crumb('b'), crumb('c'), crumb('d', true)];
		expect(crumbs).toHaveLength(MAX_VISIBLE_CRUMBS);
		const view = buildBreadcrumbView(crumbs);
		expect(view.isCollapsed).toBe(false);
		expect(view.leading).toHaveLength(MAX_VISIBLE_CRUMBS);
	});

	it('collapses the middle to `Section › … › Parent › Current` when deeper than the cap', () => {
		const crumbs = [
			crumb('knowledge'),
			crumb('region'),
			crumb('city'),
			crumb('district'),
			crumb('the-sunken-tavern', true),
		];
		const view = buildBreadcrumbView(crumbs);
		expect(view.isCollapsed).toBe(true);
		// Section root stays, the last two crumbs (parent + current) stay, the middle collapses.
		expect(view.leading.map((c) => c.id)).toEqual(['knowledge']);
		expect(view.trailing.map((c) => c.id)).toEqual(['district', 'the-sunken-tavern']);
		expect(view.collapsed.map((c) => c.id)).toEqual(['region', 'city']);
		expect(view.trailing.at(-1)?.current).toBe(true);
	});

	it('reveals every collapsed crumb so the `…` control can expand them inline', () => {
		const crumbs = Array.from({ length: 8 }, (_, i) => crumb(`c${i}`, i === 7));
		const view = buildBreadcrumbView(crumbs);
		const shown = [...view.leading, ...view.collapsed, ...view.trailing].map((c) => c.id);
		expect(shown).toEqual(crumbs.map((c) => c.id));
		expect(view.collapsed.length).toBeGreaterThan(0);
	});
});

describe('UX-NAV-007 buildCompactBreadcrumbView (mobile truncation)', () => {
	it('is empty at a section root (≤ 1 crumb), so the breadcrumb is omitted', () => {
		expect(buildCompactBreadcrumbView([]).parent).toBeNull();
		expect(buildCompactBreadcrumbView([crumb('knowledge', true)]).parent).toBeNull();
	});

	it('AC3: a deep path shows only the immediate parent, with the full path available', () => {
		const crumbs = [
			crumb('knowledge'),
			crumb('region'),
			crumb('city'),
			crumb('district'),
			crumb('the-sunken-tavern', true),
		];
		const view = buildCompactBreadcrumbView(crumbs);
		// `‹ <immediate parent>` — the parent of the current location.
		expect(view.parent?.id).toBe('district');
		expect(view.current?.id).toBe('the-sunken-tavern');
		// The sheet carries the entire ancestor → current path.
		expect(view.full.map((c) => c.id)).toEqual(crumbs.map((c) => c.id));
	});
});
