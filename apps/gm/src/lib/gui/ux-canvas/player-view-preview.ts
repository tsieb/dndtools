/**
 * DM/player view-preview model (UX-CANVAS-011). Pure, no DOM.
 *
 * Backs the non-destructive "Preview player view" overlay: the DM sees the canvas exactly as a chosen
 * player would, with `dm-only` widgets hidden and editing suspended, behind a persistent banner. The
 * preview is purely a UI overlay — it filters the data the DM session ALREADY loaded through the shared
 * visibility boundary, fetching nothing new and exposing no hidden field (UX-CANVAS-011 §Safety
 * constraint). This module reuses {@link isVisibleToViewer} so the preview filter is the SAME predicate
 * the player's real canvas, outline, and search use — one boundary, no second code path to drift.
 */

import {
	isVisibleToViewer,
	type ActorRole,
	type Viewer,
	type VisibilityClassification,
} from '$lib/gui/a11y/visibility-boundary';

/** The viewer a preview renders for: a specific player/observer, by id + role. */
export function previewViewer(actorId: string, role: ActorRole = 'player'): Viewer {
	// A preview never previews "as DM" (that is just the normal canvas); fail closed to the least
	// visible non-DM role so an unknown previewed actor can never reveal dm-only content.
	return { role: role === 'dm' ? 'observer' : role, actorId };
}

/**
 * Filter the DM's already-loaded widget set to exactly what the previewed player may see. Returns items
 * in input order with hidden ones removed entirely (absent, not display:none) — the no-leak rendering
 * rule shared with the real player canvas.
 */
export function previewVisible<T extends VisibilityClassification>(
	widgets: readonly T[],
	viewer: Viewer,
): T[] {
	return widgets.filter((w) => isVisibleToViewer(w, viewer));
}

/** Banner copy for the active preview (UX-CANVAS-011 §Player-view preview). */
export function previewBannerText(playerLabel: string): string {
	return `PLAYER VIEW PREVIEW — ${playerLabel} — Press Shift+P or Esc to exit`;
}

/** Polite/assertive announcement when preview mode is entered. */
export function previewEnterAnnouncement(playerLabel: string): string {
	return `Player view preview active for ${playerLabel}.`;
}

export const PREVIEW_EXIT_ANNOUNCEMENT = 'Player view preview closed.';
