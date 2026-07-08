/**
 * Canvas keyboard model (UX-CANVAS-015). Resolves a key event at CANVAS level (i.e. when focus is on the
 * canvas / a widget chrome, not inside a widget's content) into a discrete {@link CanvasAction}, and
 * publishes the shortcut reference data for the `?` help dialog. This is the single source of truth for
 * the canvas-level shortcut table in UX-CANVAS-015 §Canvas-level keyboard shortcuts, so every surface
 * uses the same bindings. Pure — no DOM.
 *
 * Viewport keys (`+`/`−`/`0`/`1`/`2`/`5`, arrows for pan) are intentionally NOT handled here — they are
 * resolved by the reusable `ViewportController`/`resolveViewportKey` so the pan/zoom model is owned once
 * by the canvas runtime. This module covers the manipulation/selection/history/help shortcuts.
 */

export type CanvasAction =
	| 'open-library'
	| 'delete'
	| 'undo'
	| 'redo'
	| 'select-all'
	| 'group'
	| 'ungroup'
	| 'duplicate'
	| 'z-front'
	| 'z-back'
	| 'z-forward'
	| 'z-backward'
	| 'toggle-layers'
	| 'toggle-grid'
	| 'rename'
	| 'collapse'
	| 'binding-panel'
	| 'position-panel'
	| 'resize-panel'
	| 'help'
	| 'escape';

export interface ShortcutKeyEvent {
	key: string;
	shiftKey: boolean;
	/** Ctrl OR Cmd — the platform-agnostic primary modifier. */
	mod: boolean;
	altKey: boolean;
}

/** Build a {@link ShortcutKeyEvent} from a DOM KeyboardEvent (Ctrl or Meta ⇒ `mod`). */
export function toShortcutEvent(event: {
	key: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
}): ShortcutKeyEvent {
	return { key: event.key, shiftKey: event.shiftKey, mod: event.ctrlKey || event.metaKey, altKey: event.altKey };
}

/**
 * Resolve a canvas-level key event to an action, or `null` for an unrelated key. Modifier combinations
 * follow UX-CANVAS-015 exactly: history + structural ops use the primary modifier (Ctrl/Cmd); single
 * letters are bare shortcuts; `Escape`/`Delete`/`?` are direct.
 */
export function resolveCanvasShortcut(event: ShortcutKeyEvent): CanvasAction | null {
	const { key, shiftKey, mod } = event;
	const lower = key.length === 1 ? key.toLowerCase() : key;

	if (mod) {
		switch (lower) {
			case 'z':
				return shiftKey ? 'redo' : 'undo';
			case 'y':
				return 'redo';
			case 'a':
				return 'select-all';
			case 'g':
				return shiftKey ? 'ungroup' : 'group';
			case 'd':
				return 'duplicate';
			case ']':
				return shiftKey ? 'z-front' : 'z-forward';
			case '[':
				return shiftKey ? 'z-back' : 'z-backward';
			default:
				return null;
		}
	}

	switch (key) {
		case 'Delete':
		case 'Backspace':
			return 'delete';
		case 'Escape':
			return 'escape';
		case 'F2':
			return 'rename';
		case '?':
			return 'help';
		default:
			break;
	}

	switch (lower) {
		case 'w':
		case 'i':
			return 'open-library';
		case 'l':
			return 'toggle-layers';
		case 'g':
			return 'toggle-grid';
		case 'c':
			return 'collapse';
		case 'b':
			return 'binding-panel';
		case 'p':
			return 'position-panel';
		case 'r':
			return 'resize-panel';
		default:
			return null;
	}
}

export interface ShortcutDoc {
	keys: string;
	action: string;
}

/** The canvas keyboard reference shown by the `?` dialog (UX-CANVAS-015 §Keyboard shortcuts reference). */
export const CANVAS_SHORTCUTS: readonly ShortcutDoc[] = [
	{ keys: 'W or I', action: 'Open widget library' },
	{ keys: 'Tab / Shift+Tab', action: 'Move focus between widgets (z-order)' },
	{ keys: 'Enter', action: 'Enter the focused widget; Escape returns to canvas' },
	{ keys: 'Arrow keys', action: 'Move selected widget 1 px (pan viewport when none selected)' },
	{ keys: 'Shift+Arrow', action: 'Move selected widget 8 px' },
	{ keys: 'Ctrl/Cmd+Shift+Arrow', action: 'Move selected widget 32 px' },
	{ keys: 'Delete / Backspace', action: 'Delete selected widget (with confirmation)' },
	{ keys: 'Ctrl/Cmd+Z', action: 'Undo' },
	{ keys: 'Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y', action: 'Redo' },
	{ keys: 'Ctrl/Cmd+A', action: 'Select all widgets' },
	{ keys: 'Ctrl/Cmd+G', action: 'Group selection' },
	{ keys: 'Ctrl/Cmd+Shift+G', action: 'Ungroup' },
	{ keys: 'Ctrl/Cmd+D', action: 'Duplicate selection' },
	{ keys: 'Ctrl/Cmd+] / [', action: 'Bring forward / send backward' },
	{ keys: 'Ctrl/Cmd+Shift+] / [', action: 'Bring to front / send to back' },
	{ keys: '0', action: 'Zoom to fit' },
	{ keys: '1', action: 'Zoom to 100%' },
	{ keys: '+ / −', action: 'Zoom in / out one step' },
	{ keys: 'L', action: 'Toggle layers/outline panel' },
	{ keys: 'G', action: 'Toggle grid' },
	{ keys: 'P / R', action: 'Open position / resize panel for selected widget' },
	{ keys: 'F2', action: 'Rename selected widget' },
	{ keys: 'Escape', action: 'Deselect / exit mode / exit group edit' },
	{ keys: '?', action: 'Open this keyboard shortcuts panel' },
];
