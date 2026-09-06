/**
 * RC-UX-3.3 — the keyboard shortcut registry.
 *
 * One declaration per shortcut, in one file, read by BOTH sides: the handlers that fire a shortcut
 * (`matchesShortcut` compares a real KeyboardEvent against the declared combo) and every surface
 * that PRINTS the keymap (the `?` overlay, the map editor's overlay, Settings › Accessibility).
 * Before this, the printed lists were authored by hand next to the handlers and drifted from them —
 * Settings advertised seven shortcuts while the shell implemented four more it never mentioned.
 *
 * `keys` is the legend printed on the physical key, not prose: it stays as typed in every locale.
 * Only `action` carries language, so only `action` is a catalog key.
 *
 * A shortcut with no `combo` is a platform behaviour we document but do not implement ourselves
 * (Tab focus order, the browser's own Escape) — it can be listed, never matched.
 */

import type { MessageKey } from '../../i18n';
import { TOOL_GROUPS } from '../map/tools';

/** Where a shortcut is live. `global` fires anywhere in the shell; the rest need their surface. */
export type ShortcutScope = 'global' | 'canvas' | 'map';

export interface ShortcutCombo {
	/** Compared against `KeyboardEvent.key`, case-insensitively. */
	key: string;
	/** Ctrl on Windows/Linux, Cmd on macOS — the two are never distinguished here. */
	mod?: boolean;
	shift?: boolean;
	/**
	 * True when the shortcut is allowed to fire while a text field has focus. Only the command
	 * palette qualifies: every other combo would hijack a caret mid-sentence (a bare `?` is a
	 * character, Ctrl+Right is "move by word", Ctrl+Shift+S is save-as).
	 */
	whileTyping?: boolean;
}

export interface ShortcutEntry {
	/** Stable id — handlers look a shortcut up by it, so it may not be renamed casually. */
	id: string;
	scope: ShortcutScope;
	/** The key legend, e.g. `Ctrl/⌘+K`. Never translated. */
	keys: string;
	/** What the shortcut does, in the app's voice. */
	action: MessageKey;
	combo?: ShortcutCombo;
}

/** The map editor's single-key tool keymap, derived from the tool model rather than re-typed. */
const MAP_TOOL_SHORTCUTS: readonly ShortcutEntry[] = TOOL_GROUPS.flatMap((group) =>
	group.tools
		.filter((tool) => tool.shortcut)
		.map((tool) => ({
			id: `map.tool.${tool.id}`,
			scope: 'map' as const,
			keys: (tool.shortcut as string).toUpperCase(),
			action: tool.label,
		})),
);

/** Every shortcut this build implements or documents, in the order the overlay prints them. */
export const SHORTCUTS: readonly ShortcutEntry[] = [
	{
		id: 'global.palette',
		scope: 'global',
		keys: 'Ctrl/⌘+K',
		action: 'settings.a11y.shortcutPalette',
		combo: { key: 'k', mod: true, whileTyping: true },
	},
	{
		id: 'global.help',
		scope: 'global',
		keys: '?',
		action: 'shortcuts.action.help',
		combo: { key: '?' },
	},
	{
		id: 'global.sceneDisplay',
		scope: 'global',
		keys: 'Ctrl/⌘+Shift+S',
		action: 'shortcuts.action.sceneDisplay',
		combo: { key: 's', mod: true, shift: true },
	},
	{
		id: 'global.advanceCard',
		scope: 'global',
		keys: 'Ctrl/⌘+→',
		action: 'shortcuts.action.advanceCard',
		combo: { key: 'ArrowRight', mod: true },
	},
	{ id: 'global.focus', scope: 'global', keys: 'Tab', action: 'settings.a11y.shortcutTab' },
	{ id: 'global.escape', scope: 'global', keys: 'Esc', action: 'settings.a11y.shortcutEsc' },

	{ id: 'canvas.move', scope: 'canvas', keys: '← ↑ ↓ →', action: 'settings.a11y.shortcutArrows' },
	{
		id: 'canvas.select',
		scope: 'canvas',
		keys: 'Enter / Space',
		action: 'settings.a11y.shortcutEnter',
	},
	{
		id: 'canvas.resize',
		scope: 'canvas',
		keys: 'Shift + ← ↑ ↓ →',
		action: 'settings.a11y.shortcutShiftArrows',
	},
	{
		id: 'canvas.remove',
		scope: 'canvas',
		keys: 'Delete',
		action: 'settings.a11y.shortcutDelete',
	},
	{
		id: 'canvas.undoRedo',
		scope: 'canvas',
		keys: 'Ctrl/⌘+Z · Ctrl/⌘+Shift+Z',
		action: 'shortcuts.action.canvasUndoRedo',
	},

	...MAP_TOOL_SHORTCUTS,
	{
		id: 'map.brushSize',
		scope: 'map',
		keys: '[ · ]',
		action: 'mapEditor.shortcut.brushSize',
	},
	{
		id: 'map.undoRedo',
		scope: 'map',
		keys: 'Ctrl/⌘+Z · Ctrl/⌘+Shift+Z',
		action: 'mapEditor.shortcut.undoRedo',
	},
	{ id: 'map.zoom', scope: 'map', keys: '+ · − · 0', action: 'mapEditor.shortcut.zoom' },
	{ id: 'map.pan', scope: 'map', keys: 'Space + drag', action: 'mapEditor.shortcut.pan' },
	{ id: 'map.nudge', scope: 'map', keys: '← ↑ ↓ →', action: 'mapEditor.shortcut.nudge' },
	{
		id: 'map.delete',
		scope: 'map',
		keys: 'Delete / Backspace',
		action: 'mapEditor.shortcut.delete',
	},
	{ id: 'map.cancel', scope: 'map', keys: 'Esc', action: 'mapEditor.shortcut.cancel' },
	{ id: 'map.finishPath', scope: 'map', keys: 'Enter', action: 'mapEditor.shortcut.finishPath' },
];

/** Every shortcut in a scope, in registry order. */
export function shortcutsForScope(scope: ShortcutScope): readonly ShortcutEntry[] {
	return SHORTCUTS.filter((entry) => entry.scope === scope);
}

/**
 * Look a shortcut up by id. Throws rather than returning undefined: a handler bound to an id that
 * no longer exists is a silently dead key, which is exactly what this registry is here to prevent,
 * and `pnpm test:app` runs the lookup for every id a handler uses.
 */
export function shortcut(id: string): ShortcutEntry {
	const found = SHORTCUTS.find((entry) => entry.id === id);
	if (!found) throw new Error(`Unknown keyboard shortcut: ${id}`);
	return found;
}

/** True when `event` is the declared combo for `id`, honouring the text-field guard. */
export function matchesShortcut(
	id: string,
	event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
	options: { typing?: boolean } = {},
): boolean {
	const { combo } = shortcut(id);
	if (!combo) return false;
	if (options.typing && !combo.whileTyping) return false;
	if (event.altKey) return false;
	if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false;
	if (!!combo.mod !== (event.metaKey || event.ctrlKey)) return false;
	// `?` is Shift+/ on most layouts, so a combo that does not ask about Shift must not check it.
	if (combo.shift !== undefined && combo.shift !== event.shiftKey) return false;
	return true;
}
