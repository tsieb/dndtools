/**
 * Empty-canvas teaching-state model (UX-CANVAS-013). Pure, no DOM.
 *
 * Supplies the content for the atmospheric, instructive empty state the canvas shows when no widgets are
 * placed: a centred headline + call-to-action, secondary hint annotations (suppressed on compact
 * profiles), a keyboard hint bar, and the screen-reader announcement. The empty state is decorative
 * (`aria-hidden`) except for the real CTA button and the polite SR announcement; it disappears entirely
 * once the first widget exists (the route renders it only when the tile list is empty).
 */

export interface EmptyCanvasHint {
	id: string;
	text: string;
}

export interface EmptyCanvasContent {
	headline: string;
	/** CTA button label — opens the widget library (same as the `W` shortcut). */
	ctaLabel: string;
	/** Secondary annotations around the canvas (omitted on compact per UX-CANVAS-013 §Platform). */
	hints: EmptyCanvasHint[];
	/** Thin keyboard hint bar (decorative reminders; real shortcuts live in the `?` reference). */
	keyboardHints: string[];
	/** Polite screen-reader announcement for the empty state. */
	announcement: string;
}

const SECONDARY_HINTS: EmptyCanvasHint[] = [
	{ id: 'library', text: 'Open the widget library to drop in trackers, maps, and notes.' },
	{ id: 'shortcut', text: 'Press W to open the widget panel.' },
	{ id: 'preview', text: 'Press Shift+P to preview what your players will see.' },
];

const KEYBOARD_HINTS: string[] = [
	'W — Add widget',
	'0 — Zoom to fit',
	'Shift+P — Preview player view',
];

/**
 * Build the empty-state content. On compact (mobile) profiles the secondary callout annotations are
 * dropped to avoid clutter (UX-CANVAS-013 §Platform profiles); the headline, CTA, and hint bar remain.
 */
export function emptyCanvasContent(options: { compact?: boolean } = {}): EmptyCanvasContent {
	return {
		headline: 'Your scene is empty',
		ctaLabel: 'Add your first widget',
		hints: options.compact ? [] : SECONDARY_HINTS,
		keyboardHints: KEYBOARD_HINTS,
		announcement: 'Scene empty — press W or activate the Add widget button to begin.',
	};
}
