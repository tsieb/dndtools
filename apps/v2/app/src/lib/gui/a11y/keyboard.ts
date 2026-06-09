/**
 * Keyboard primitives (UX-A11Y-002 keyboard parity, UX-A11Y-014 consistent help).
 *
 * Shared key matchers so every surface recognises activation and the product-wide shortcuts the
 * same way (§6.3 keyboard map). The Ctrl/Cmd equivalence is resolved here once: a Must-have action
 * bound to `Ctrl+K` on Windows/Linux is reachable via `Cmd+K` on macOS without per-surface
 * branching. Pure — no DOM, no platform probing — so the matchers are unit-tested directly.
 */

/** A normalized chord description. `ctrlOrMeta` matches EITHER Control or Meta (Cmd). */
export interface Shortcut {
	/** Single key, compared case-insensitively against `KeyboardEvent.key`. */
	key: string;
	ctrlOrMeta?: boolean;
	shift?: boolean;
	alt?: boolean;
}

/** Minimal shape of the parts of `KeyboardEvent` the matchers read (test-friendly). */
export interface KeyChord {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}

/** Enter or Space — the canonical "activate this control" keys (buttons, menuitems, options). */
export function isActivationKey(event: KeyChord): boolean {
	return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
}

/** Match a chord against a {@link Shortcut}, treating Control and Meta as interchangeable. */
export function matchesShortcut(event: KeyChord, shortcut: Shortcut): boolean {
	if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
	const ctrlOrMeta = Boolean(event.ctrlKey) || Boolean(event.metaKey);
	if (Boolean(shortcut.ctrlOrMeta) !== ctrlOrMeta) return false;
	if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return false;
	if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return false;
	return true;
}

/**
 * The product-wide help key (UX-A11Y-014 / §6.3): `?` (no modifier beyond the Shift used to type it)
 * or `F1`. Recognised consistently on every route so the keyboard-shortcut reference is reachable
 * the same way everywhere (UX-A11Y-014 AC2).
 */
export function isHelpKey(event: KeyChord): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	if (event.key === 'F1') return true;
	// `?` already implies Shift on most layouts; accept it as the help key.
	return event.key === '?';
}

/**
 * Whether a keydown originated from a text-entry control, where global single-key shortcuts (like
 * `?`) must NOT fire so the user can type the character. Modifier chords (Ctrl/Cmd+K) still apply.
 */
export function isFromTextEntry(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	return target.isContentEditable === true;
}

/** One row of the keyboard-shortcut reference shown by the consistent Help dialog (UX-A11Y-014). */
export interface ShortcutReference {
	keys: string;
	action: string;
	scope: string;
}

/**
 * The product-wide keyboard reference (§6.3). Rendered by the Help dialog, which appears in the same
 * position on every route (UX-A11Y-014). Profile/nav-section shortcuts (Alt+N) are owned by the
 * phase-02 shell epic; this list covers the interaction primitives delivered here.
 */
export const KEYBOARD_SHORTCUTS: readonly ShortcutReference[] = [
	{ keys: 'Ctrl / Cmd + K', action: 'Open the command palette and search', scope: 'All routes' },
	{ keys: '?  or  F1', action: 'Open keyboard shortcuts (this dialog)', scope: 'All routes' },
	{ keys: 'Tab / Shift + Tab', action: 'Move focus forward / backward', scope: 'All routes' },
	{ keys: 'Enter / Space', action: 'Activate the focused control', scope: 'All routes' },
	{ keys: 'Escape', action: 'Close the open dialog, sheet, or menu', scope: 'Overlays' },
	{
		keys: 'Arrow keys',
		action: 'Move within tabs, menus, trees, and grids',
		scope: 'Composite widgets',
	},
	{
		keys: 'Ctrl + Arrow',
		action: 'Move the focused canvas widget (drag alternative)',
		scope: 'Scene canvas',
	},
	{
		keys: 'Ctrl + Up / Down',
		action: 'Reorder the focused initiative row (drag alternative)',
		scope: 'Combat tracker',
	},
];
