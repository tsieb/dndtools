/**
 * Scene Outline model (UX-A11Y-004): structural, screen-reader access to the spatial canvas.
 *
 * The canonical non-visual path to canvas widgets — Figma's Layers panel for this product. Builds an
 * ARIA tree/listbox model of all widgets in layer order, each with a visibility-SAFE accessible name,
 * position context (`aria-level`/`setsize`/`posinset`), and a non-colour visibility label, so a
 * screen-reader user reaches every widget without the spatial model (UX-A11Y-003 structural mode).
 *
 * NO-LEAK (UX-A11Y-008): the model is built by FILTERING widgets through `filterVisibleForViewer`
 * BEFORE any name is computed, so a Player outline never contains a DM-only widget's name, type, or
 * visibility label — the item is absent from the list (not rendered hidden). DM-only items are never
 * in the player's Tab order either, because the player model simply has no such item.
 *
 * Pure — no DOM. `SceneOutline.svelte` renders this model with roving tabindex.
 */

import {
	filterVisibleForViewer,
	type SceneVisibility,
	type Viewer,
	type VisibilityClassification,
} from './visibility-boundary';

/** One widget as the Scene Outline understands it (the caller maps the raw widget onto this). */
export interface OutlineWidgetInput extends VisibilityClassification {
	id: string;
	/** Widget type (e.g. `note`, `map`, `timer`). Part of the accessible name. */
	type: string;
	/** Optional human display name (bound entity / title). Omitted ⇒ name is the type alone. */
	name?: string;
	/** Document/layer order key; lower renders earlier in the outline. */
	layerOrder: number;
	/** Group id for nested widgets, when the outline is a tree. */
	groupId?: string | null;
}

/** A built outline item, ready to render as a `treeitem`/`option`. */
export interface OutlineItem {
	id: string;
	type: string;
	/** Visibility-safe accessible name, e.g. "Note widget: Tavern brawl". */
	accessibleName: string;
	/** Non-colour visibility label, e.g. "Visible" / "Shared" / "DM only" (DM context only). */
	visibilityLabel: string;
	visibility: SceneVisibility;
	groupId: string | null;
	/** 1-based position within the (filtered) set, for `aria-posinset`. */
	posinset: number;
	/** Total filtered count, for `aria-setsize`. */
	setsize: number;
}

export interface SceneOutlineModel {
	/** `tree` when any widget is grouped, else `listbox` (UX-A11Y-004 spec). */
	role: 'tree' | 'listbox';
	/** Panel landmark label (`aria-label="Scene outline"`). */
	panelLabel: string;
	/** Live-region count string, e.g. "5 widgets" / "No widgets" / "No widgets match filter". */
	countLabel: string;
	items: OutlineItem[];
	/** No widgets exist at all (for this viewer). */
	empty: boolean;
	/** Widgets existed but the active filter/search removed them all. */
	filteredEmpty: boolean;
}

export interface OutlineOptions {
	/** Case-insensitive widget-type filter. */
	typeFilter?: string;
	/** Case-insensitive name/type search. */
	search?: string;
}

const VISIBILITY_LABEL: Readonly<Record<SceneVisibility, string>> = {
	'player-visible': 'Visible',
	shared: 'Shared',
	'dm-only': 'DM only',
};

/** The visibility-safe accessible name for an outline item: "{Type} widget" plus an optional name. */
export function outlineItemName(widget: OutlineWidgetInput): string {
	const type = widget.type.trim() || 'Widget';
	const typeLabel = `${type.charAt(0).toUpperCase()}${type.slice(1)} widget`;
	const name = widget.name?.trim();
	return name ? `${typeLabel}: ${name}` : typeLabel;
}

function matchesFilters(widget: OutlineWidgetInput, options: OutlineOptions): boolean {
	const typeFilter = options.typeFilter?.trim().toLowerCase();
	if (typeFilter && widget.type.trim().toLowerCase() !== typeFilter) return false;
	const search = options.search?.trim().toLowerCase();
	if (search) {
		const haystack = `${widget.type} ${widget.name ?? ''}`.toLowerCase();
		if (!haystack.includes(search)) return false;
	}
	return true;
}

/**
 * Build the Scene Outline for a viewer. Order of operations is the security contract: filter by
 * VISIBILITY first (so hidden items never reach name computation), then by the user's type/search
 * filter, then sort by layer order, then compute names + ARIA position. A Player and a DM viewing the
 * same scene get different models, and the Player's can never reference a DM-only widget.
 */
export function buildSceneOutline(
	widgets: readonly OutlineWidgetInput[],
	viewer: Viewer,
	options: OutlineOptions = {},
): SceneOutlineModel {
	const visible = filterVisibleForViewer(widgets, viewer);
	const matched = visible
		.filter((w) => matchesFilters(w, options))
		.sort((a, b) => a.layerOrder - b.layerOrder);

	const setsize = matched.length;
	const items: OutlineItem[] = matched.map((widget, index) => ({
		id: widget.id,
		type: widget.type,
		accessibleName: outlineItemName(widget),
		visibilityLabel: VISIBILITY_LABEL[widget.visibility] ?? VISIBILITY_LABEL['dm-only'],
		visibility: widget.visibility,
		groupId: widget.groupId ?? null,
		posinset: index + 1,
		setsize,
	}));

	const empty = visible.length === 0;
	const filteredEmpty = !empty && matched.length === 0;
	const role: 'tree' | 'listbox' = items.some((item) => item.groupId !== null) ? 'tree' : 'listbox';

	let countLabel: string;
	if (empty) countLabel = 'No widgets';
	else if (filteredEmpty) countLabel = 'No widgets match filter';
	else countLabel = `${items.length} widget${items.length === 1 ? '' : 's'}`;

	return { role, panelLabel: 'Scene outline', countLabel, items, empty, filteredEmpty };
}

/** Polite announcement when a widget is activated from the outline and focused on the canvas. */
export function outlineActivationAnnouncement(item: Pick<OutlineItem, 'accessibleName'>): string {
	return `Focused ${item.accessibleName} on the canvas.`;
}
