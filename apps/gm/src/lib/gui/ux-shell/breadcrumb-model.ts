import type { NavigationCrumb } from '@dndtools/core';

/**
 * UX-NAV-007 — breadcrumb presentation model (pure).
 *
 * The Processing Core derives the location-style breadcrumb trail (`resolveNavigationView`,
 * NAV-003): one crumb per ancestor from the section root to the current entity, already
 * visibility-filtered so a hidden ancestor never appears. This module is the GUI-layer
 * presentation refinement UX-NAV-007 adds on top of that trail — it decides, from the trail
 * and the active platform profile, exactly which crumbs render and which collapse, without
 * re-deriving the trail or widening visibility (route-shape/presentation knowledge is the
 * GUI's — Contract 1).
 *
 * It is pure (no Svelte runtime, no DOM) so the collapse/truncation rules are unit-tested
 * directly and the `Breadcrumbs` component stays a thin renderer.
 */

/** The default maximum number of crumbs shown before the middle collapses (UX-NAV-007). */
export const MAX_VISIBLE_CRUMBS = 4;

/**
 * The collapsed desktop/tablet-landscape breadcrumb view (UX-NAV-007):
 * `Section › … › Parent › Current`. When the trail fits within `maxVisible`, everything is
 * `leading` and there is no collapsed group.
 */
export interface BreadcrumbView {
	/** Crumbs shown before the collapsed `…` group — always at least the section root. */
	leading: NavigationCrumb[];
	/** The hidden middle crumbs, revealed when the `…` control is expanded. */
	collapsed: NavigationCrumb[];
	/** Crumbs shown after the collapsed `…` group (the nearest ancestors + current). */
	trailing: NavigationCrumb[];
	/** True when a middle group is collapsed behind the `…` control. */
	isCollapsed: boolean;
}

/**
 * Build the collapsed breadcrumb view for the full-trail (Desktop / Tablet landscape)
 * surface. Up to `maxVisible` crumbs render in place; a deeper trail keeps the section root
 * plus the last `maxVisible - 2` crumbs and collapses the middle into a `…` control
 * (`Section › … › Parent › Current`). The collapsed crumbs are returned so the `…` control
 * can reveal them inline (UX-NAV-007 spec).
 */
export function buildBreadcrumbView(
	crumbs: readonly NavigationCrumb[],
	maxVisible: number = MAX_VISIBLE_CRUMBS,
): BreadcrumbView {
	const all = [...crumbs];
	// Never collapse below three visible (root + `…` + current would be the minimum useful form).
	const cap = Math.max(3, maxVisible);
	if (all.length <= cap) {
		return { leading: all, collapsed: [], trailing: [], isCollapsed: false };
	}
	const trailingCount = cap - 2; // reserve one slot for the root and one for the `…` control
	const leading = all.slice(0, 1);
	const trailing = all.slice(all.length - trailingCount);
	const collapsed = all.slice(1, all.length - trailingCount);
	return { leading, collapsed, trailing, isCollapsed: collapsed.length > 0 };
}

/** The compact (Mobile / Tablet portrait) breadcrumb truncation (UX-NAV-007): a single
 *  `‹ <immediate parent>` control plus the current crumb, with the full path available in a
 *  sheet. `parent` is the crumb directly above the current location; `null` at a section root
 *  (where the breadcrumb is absent entirely). */
export interface CompactBreadcrumbView {
	/** The immediate parent crumb, shown as `‹ <title>` and the sheet trigger. */
	parent: NavigationCrumb | null;
	/** The current location crumb (non-interactive, `aria-current`). */
	current: NavigationCrumb | null;
	/** The full ancestor → current path, shown inside the expand sheet. */
	full: NavigationCrumb[];
}

/**
 * Build the compact breadcrumb truncation. The trail is shown as `‹ <immediate parent>` with
 * the full path deferred to a tap-to-expand sheet (UX-NAV-007 AC3). Returns empty parent/
 * current when the trail is at the section root (≤ 1 crumb) so the breadcrumb is omitted.
 */
export function buildCompactBreadcrumbView(
	crumbs: readonly NavigationCrumb[],
): CompactBreadcrumbView {
	if (crumbs.length <= 1) return { parent: null, current: null, full: [] };
	const full = [...crumbs];
	return {
		parent: full[full.length - 2] ?? null,
		current: full[full.length - 1] ?? null,
		full,
	};
}
