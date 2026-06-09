/**
 * Widget library / insert-flow model (UX-CANVAS-002). Pure data + filtering for the "place a widget"
 * surface: the categorised catalogue, the live name/type search, profile availability (unsupported
 * widgets are shown disabled, never hidden — CMD-005), and the default placement size. The Svelte
 * `WidgetLibrary` renders this model; the route turns a chosen item into a `scene.add-widget` command.
 * No DOM, no `$state`.
 */

import type { PlatformProfileId } from '@dndtools/v2-core';

export type WidgetCategory =
	| 'Combat'
	| 'Characters'
	| 'Maps'
	| 'Notes'
	| 'Dice & Timers'
	| 'Atmosphere'
	| 'Reference';

export interface LibraryWidgetItem {
	type: string;
	label: string;
	category: WidgetCategory;
	/** Default placement size (UX-CANVAS-002 §Default sizes — declared per widget). */
	defaultSize: { w: number; h: number };
	/** Profiles the widget supports; others render disabled at 40% opacity (UX-CANVAS-002). */
	supportedProfiles: readonly PlatformProfileId[];
}

const ALL_PROFILES: readonly PlatformProfileId[] = ['desktop', 'tablet', 'mobile', 'web'];

/** Default placement size when a widget declares none (UX-CANVAS-002 / system widget default 240×160). */
export const DEFAULT_WIDGET_SIZE = { w: 240, h: 160 };

/**
 * The built-in widget catalogue. Types match the system widget packages so a placed widget resolves to a
 * real definition. `map` is marked desktop/tablet-only to exercise the "unavailable on this profile"
 * affordance (CMD-005) without making any Must-have insert path profile-gated.
 */
export const WIDGET_LIBRARY: readonly LibraryWidgetItem[] = [
	{ type: 'initiative', label: 'Initiative Tracker', category: 'Combat', defaultSize: { w: 280, h: 200 }, supportedProfiles: ALL_PROFILES },
	{ type: 'character', label: 'Character Sheet', category: 'Characters', defaultSize: { w: 320, h: 240 }, supportedProfiles: ALL_PROFILES },
	{ type: 'map', label: 'Map', category: 'Maps', defaultSize: { w: 360, h: 280 }, supportedProfiles: ['desktop', 'tablet', 'web'] },
	{ type: 'note', label: 'Note', category: 'Notes', defaultSize: { w: 240, h: 160 }, supportedProfiles: ALL_PROFILES },
	{ type: 'dice', label: 'Dice Roller', category: 'Dice & Timers', defaultSize: { w: 200, h: 160 }, supportedProfiles: ALL_PROFILES },
	{ type: 'timer', label: 'Timer', category: 'Dice & Timers', defaultSize: { w: 200, h: 120 }, supportedProfiles: ALL_PROFILES },
	{ type: 'ambience', label: 'Ambience', category: 'Atmosphere', defaultSize: { w: 240, h: 140 }, supportedProfiles: ALL_PROFILES },
	{ type: 'reference', label: 'Quick Reference', category: 'Reference', defaultSize: { w: 280, h: 220 }, supportedProfiles: ALL_PROFILES },
];

export interface LibraryEntry extends LibraryWidgetItem {
	/** False when the widget is not supported on the active profile (rendered disabled, not hidden). */
	available: boolean;
	/** Reason shown in the disabled item's tooltip/disclosure. */
	unavailableReason: string | null;
}

export interface LibraryCategoryGroup {
	category: WidgetCategory;
	items: LibraryEntry[];
}

/** Does the catalogue item match the live search (name + type tags), case-insensitive? */
function matchesSearch(item: LibraryWidgetItem, search: string): boolean {
	const q = search.trim().toLowerCase();
	if (!q) return true;
	// UX-CANVAS-002 §Search: "searches name and type tags" — the category is a header, not a search key.
	return `${item.type} ${item.label}`.toLowerCase().includes(q);
}

/**
 * Build the categorised, searched, profile-aware library model. Unsupported widgets are KEPT (marked
 * `available: false`) so the user can see — and learn why — a widget is unavailable on this profile,
 * rather than it silently disappearing (CMD-005 / UX-CANVAS-002 §Unavailable widgets).
 */
export function buildLibrary(
	profile: PlatformProfileId,
	options: { search?: string; catalogue?: readonly LibraryWidgetItem[] } = {},
): { groups: LibraryCategoryGroup[]; matchCount: number } {
	const catalogue = options.catalogue ?? WIDGET_LIBRARY;
	const search = options.search ?? '';
	const byCategory = new Map<WidgetCategory, LibraryEntry[]>();
	let matchCount = 0;

	for (const item of catalogue) {
		if (!matchesSearch(item, search)) continue;
		matchCount += 1;
		const available = item.supportedProfiles.includes(profile);
		const entry: LibraryEntry = {
			...item,
			available,
			unavailableReason: available ? null : `Not supported on ${profile}.`,
		};
		const list = byCategory.get(item.category) ?? [];
		list.push(entry);
		byCategory.set(item.category, list);
	}

	const order: WidgetCategory[] = [
		'Combat',
		'Characters',
		'Maps',
		'Notes',
		'Dice & Timers',
		'Atmosphere',
		'Reference',
	];
	const groups: LibraryCategoryGroup[] = [];
	for (const category of order) {
		const items = byCategory.get(category);
		if (items && items.length > 0) groups.push({ category, items });
	}
	return { groups, matchCount };
}

/** The default size for a widget type from the catalogue, or the global default. */
export function defaultSizeForType(type: string): { w: number; h: number } {
	return WIDGET_LIBRARY.find((w) => w.type === type)?.defaultSize ?? DEFAULT_WIDGET_SIZE;
}

/**
 * Where a placed widget's top-left should land so it is CENTRED on the chosen point (UX-CANVAS-002:
 * "places at the declared default, centered on the clicked/tapped point"). Negative results are clamped
 * to 0 so a widget never starts at a negative origin.
 */
export function placementTopLeft(center: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
	return { x: Math.max(0, Math.round(center.x - size.w / 2)), y: Math.max(0, Math.round(center.y - size.h / 2)) };
}

/** Polite announcement for the placement-ghost mode (UX-CANVAS-002 accessibility). */
export const GHOST_ACTIVE_ANNOUNCEMENT =
	'Widget ghost active — use arrow keys to position, Enter to place, Escape to cancel.';

export function placedAnnouncement(label: string): string {
	return `${label} placed and selected.`;
}
