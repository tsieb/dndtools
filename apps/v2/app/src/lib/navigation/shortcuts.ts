import type { GlobalNavItem } from './global-nav';

/**
 * UX-NAV-019 — the global keyboard shortcut registry.
 *
 * A single, actor-filtered list of every product-wide keyboard shortcut. It is the one source the
 * command palette's row hints (UX-NAV-019 AC2) and the searchable keyboard-shortcuts help panel
 * (UX-NAV-019 AC3) both render, so a shortcut is never described two different ways and the help
 * panel can never drift from what the keys actually do.
 *
 * ACTOR SAFETY (UX-NAV-019 AC4): the registry is built from the SAME actor-filtered navigation data
 * the primary nav and command palette consume. Navigation shortcuts are derived from the actor's
 * visible global-nav items, and the DM-only Scenes-authoring shortcut is present ONLY when the actor
 * can reach the Scenes capability (a DM). For a player/observer that destination is absent from the
 * input data, so its shortcut is ABSENT from the registry entirely — not merely hidden — and the help
 * panel and palette hints can never reveal that a DM-only shortcut exists.
 *
 * Pure (no Svelte runtime, no DOM): the shell builds the registry from actor-filtered inputs and the
 * unit tests exercise it directly.
 */

/** Display grouping for the keyboard-shortcuts help panel. */
export type ShortcutGroup = 'Command surface' | 'Navigation' | 'Shell' | 'Overlays' | 'Canvas';

/** One registered keyboard shortcut. `keys` is the human-readable chord; `route` is set for the
 *  navigation shortcuts so the palette can map a destination row to its key hint. */
export interface ShortcutDescriptor {
	/** Stable id, unique within the registry. */
	id: string;
	/** Human-readable chord, e.g. `Alt + 4` or `Ctrl / Cmd + K`. */
	keys: string;
	/** What the shortcut does. */
	action: string;
	/** Where it applies (e.g. "All routes", "Desktop", "DM only"). */
	scope: string;
	group: ShortcutGroup;
	/** The destination route for navigation shortcuts (used to map palette rows to hints). */
	route?: string;
}

/** The static command-surface shortcuts, available on every profile to every actor. */
const COMMAND_SURFACE_SHORTCUTS: readonly ShortcutDescriptor[] = Object.freeze([
	{
		id: 'palette',
		keys: 'Ctrl / Cmd + K',
		action: 'Open the command palette',
		scope: 'All routes',
		group: 'Command surface',
	},
	{
		id: 'search',
		keys: 'Ctrl / Cmd + Shift + F',
		action: 'Open global search',
		scope: 'All routes',
		group: 'Command surface',
	},
	{
		id: 'switcher',
		keys: 'Ctrl / Cmd + O',
		action: 'Open the quick switcher (Go to…)',
		scope: 'All routes',
		group: 'Command surface',
	},
	{
		id: 'help',
		keys: '?  or  F1',
		action: 'Open keyboard shortcuts',
		scope: 'All routes',
		group: 'Command surface',
	},
]);

/** Shell-chrome + history shortcuts (some Desktop-only), available to every actor. */
const SHELL_SHORTCUTS: readonly ShortcutDescriptor[] = Object.freeze([
	{
		id: 'sidebar',
		keys: 'Ctrl + \\',
		action: 'Collapse / expand the sidebar',
		scope: 'Desktop',
		group: 'Shell',
	},
	{
		id: 'backlinks',
		keys: 'Alt + B',
		action: 'Toggle the backlinks panel',
		scope: 'Desktop',
		group: 'Shell',
	},
	{
		id: 'landmark',
		keys: 'F6 / Shift + F6',
		action: 'Cycle landmark focus (next / previous)',
		scope: 'All routes',
		group: 'Shell',
	},
	{
		id: 'history',
		keys: 'Alt + ← / Alt + →',
		action: 'Go back / forward',
		scope: 'All routes',
		group: 'Shell',
	},
]);

/** Overlay-interaction shortcuts (palette, search, switcher, quick switcher, dialogs). */
const OVERLAY_SHORTCUTS: readonly ShortcutDescriptor[] = Object.freeze([
	{
		id: 'overlay.move',
		keys: '↑ / ↓',
		action: 'Move between results',
		scope: 'Overlays',
		group: 'Overlays',
	},
	{
		id: 'overlay.activate',
		keys: 'Enter',
		action: 'Open or run the highlighted result',
		scope: 'Overlays',
		group: 'Overlays',
	},
	{
		id: 'overlay.close',
		keys: 'Escape',
		action: 'Clear the text, then close the overlay',
		scope: 'Overlays',
		group: 'Overlays',
	},
]);

/** Canvas / combat drag-alternative shortcuts (keyboard parity for pointer-drag actions). */
const CANVAS_SHORTCUTS: readonly ShortcutDescriptor[] = Object.freeze([
	{
		id: 'canvas.move',
		keys: 'Ctrl + Arrow',
		action: 'Move the focused canvas widget (drag alternative)',
		scope: 'Scene canvas',
		group: 'Canvas',
	},
	{
		id: 'combat.reorder',
		keys: 'Ctrl + Up / Down',
		action: 'Reorder the focused initiative row (drag alternative)',
		scope: 'Combat tracker',
		group: 'Canvas',
	},
]);

/** The DM-only Scenes-authoring keyboard shortcut chord (UX-NAV-019 AC4). */
export const SCENES_SHORTCUT_KEYS = 'Alt + Shift + S';

export interface ShortcutRegistryInput {
	/** The actor's visible global-nav items (already actor-filtered, with positions). */
	globalNav: readonly GlobalNavItem[];
	/** The DM-only Scenes destination route, or `null` when the actor cannot reach Scenes. */
	scenesRoute: string | null;
}

/**
 * Build the actor-filtered keyboard shortcut registry (UX-NAV-019). Navigation shortcuts are derived
 * from the actor's visible global-nav items, so an actor who cannot reach a section never receives its
 * shortcut. The DM-only Scenes shortcut is included ONLY when `scenesRoute` is non-null — i.e. only for
 * an actor who can reach the DM-only Scenes capability — so a player/observer registry omits it entirely
 * (AC4). The result order is stable: command surface, navigation, shell, overlays, canvas.
 */
export function buildShortcutRegistry(input: ShortcutRegistryInput): ShortcutDescriptor[] {
	const shortcuts: ShortcutDescriptor[] = [...COMMAND_SURFACE_SHORTCUTS];

	// Navigation — derived from the actor's visible global nav. The home (Command Center) item answers
	// Alt+Shift+H in addition to its positional Alt+1; both are surfaced so muscle memory works either way.
	const home = input.globalNav.find((item) => item.home);
	if (home) {
		shortcuts.push({
			id: 'nav.home',
			keys: 'Alt + Shift + H',
			action: `Go to ${home.title}`,
			scope: 'All routes',
			group: 'Navigation',
			route: home.route,
		});
	}
	for (const item of input.globalNav) {
		shortcuts.push({
			id: `nav.alt${item.position}`,
			keys: `Alt + ${item.position}`,
			action: `Go to ${item.title}`,
			scope: 'All routes',
			group: 'Navigation',
			route: item.route,
		});
	}
	// DM-only: the Scenes authoring capability is reachable only by a DM, so its shortcut is present only
	// when the actor can reach it (AC4). Absent — not disabled — for players/observers.
	if (input.scenesRoute) {
		shortcuts.push({
			id: 'nav.scenes',
			keys: SCENES_SHORTCUT_KEYS,
			action: 'Go to Scenes',
			scope: 'DM only',
			group: 'Navigation',
			route: input.scenesRoute,
		});
	}

	shortcuts.push(...SHELL_SHORTCUTS, ...OVERLAY_SHORTCUTS, ...CANVAS_SHORTCUTS);
	return shortcuts;
}

/**
 * The keyboard-shortcut hint for a destination route, e.g. `Alt + 2` for the Session route. Used by the
 * command palette to show the shortcut on a navigation result row (UX-NAV-019 AC2). Positional Alt+N
 * shortcuts win over the home `Alt+Shift+H` so each section shows its own number. Returns `null` when no
 * shortcut targets the route.
 */
export function shortcutHintForRoute(
	shortcuts: readonly ShortcutDescriptor[],
	route: string,
): string | null {
	const positional = shortcuts.find((s) => s.route === route && /^Alt \+ \d/.test(s.keys));
	if (positional) return positional.keys;
	const any = shortcuts.find((s) => s.route === route);
	return any ? any.keys : null;
}

/**
 * Filter the registry to the shortcuts whose chord, action, scope, or group matches a case-insensitive
 * query (UX-NAV-019 AC3 — the help panel is searchable). An empty query returns the whole registry.
 */
export function searchShortcuts(
	shortcuts: readonly ShortcutDescriptor[],
	query: string,
): ShortcutDescriptor[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...shortcuts];
	return shortcuts.filter((shortcut) =>
		[shortcut.keys, shortcut.action, shortcut.scope, shortcut.group].some((field) =>
			field.toLowerCase().includes(q),
		),
	);
}
