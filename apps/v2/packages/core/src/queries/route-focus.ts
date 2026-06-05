/**
 * Navigation focus restoration model (NAV-004).
 *
 * After a navigation completes, exactly one thing should receive focus / scroll: either
 * the heading the URL's hash anchor points at, or — for a normal route transition with
 * no hash — the route landmark, which is also announced to assistive technology. Getting
 * this wrong is the defect NAV-004 is traced to (`CODEX-PR7-HASH-FOCUS`): a route shell
 * that unconditionally focuses its landmark *steals* focus and scroll away from a
 * heading-hash deep link, so a `#section` anchor never lands on its heading.
 *
 * This module is the single Processing-Core decision the GUI route shell reads from.
 * Given the completed route and the URL hash, {@link resolveRouteFocus} returns a
 * discriminated focus target — `heading-anchor` or `route-landmark` — and whether the
 * route-change live announcement should fire. The GUI applies the target (querying the
 * DOM, calling `.focus()`/`scrollIntoView()`, and updating the live region); it makes no
 * policy decision about *which* target wins (Contract 1).
 *
 * Browser back/forward is preserved because this model is derived purely from the
 * destination URL: it adds no history entries and replaces no navigation. The GUI uses
 * ordinary `<a href>`/`goto` navigation, so the back/forward stack is the browser's.
 */

/** A heading-hash anchor: focus and scroll the heading the hash names (NAV-004 AC1). */
export interface HeadingAnchorFocusTarget {
	kind: 'heading-anchor';
	/** The element id the heading hash names, e.g. `overview` for `#overview`. */
	anchorId: string;
	/**
	 * Whether to announce the route change in the live region. Deep-linking into a
	 * heading is a within-page jump, not a fresh route landing, so the landmark
	 * announcement is suppressed to avoid double-speaking; the heading itself, once
	 * focused, is what the screen reader reads (NAV-004 AC1).
	 */
	announceRoute: false;
}

/** The route landmark: focus the route landmark and announce the route (NAV-004 AC2). */
export interface RouteLandmarkFocusTarget {
	kind: 'route-landmark';
	/** Always announce a normal route transition (NAV-004 AC2 / NAV-007 AC2). */
	announceRoute: true;
}

export type RouteFocusTarget = HeadingAnchorFocusTarget | RouteLandmarkFocusTarget;

export interface RouteFocusInput {
	/**
	 * The URL hash including a leading `#`, or `''`. A heading hash (`#overview`) selects
	 * the heading-anchor target; an empty hash selects the route landmark.
	 */
	hash?: string;
	/**
	 * True when this is a fresh navigation (a route change), false when the same route is
	 * re-rendered without a navigation. Only a real navigation announces its route, so
	 * unrelated reactive re-renders never re-fire the announcement.
	 */
	isNavigation?: boolean;
}

/** Parse the anchor id from a raw hash. Empty, `#`, or `#top` are not heading anchors. */
function anchorIdFromHash(hash: string): string | null {
	const raw = hash.startsWith('#') ? hash.slice(1) : hash;
	const trimmed = raw.trim();
	if (!trimmed || trimmed === 'top') return null;
	try {
		// A hash may be percent-encoded (`#%C3%A9`); decode so the GUI matches the real id.
		return decodeURIComponent(trimmed);
	} catch {
		// A malformed escape sequence is treated as a literal id rather than throwing.
		return trimmed;
	}
}

/**
 * Decide the post-navigation focus target (NAV-004).
 *
 * - A URL with a heading hash yields a `heading-anchor` target so the heading scroll
 *   target remains active instead of unconditional landmark focus (NAV-004 AC1). The
 *   route announcement is suppressed for the within-page jump.
 * - A normal route transition without a hash yields a `route-landmark` target so the
 *   route landmark receives focus and a live announcement (NAV-004 AC2).
 *
 * `isNavigation` defaults to true so a bare call (the common "navigation just completed"
 * case) behaves as a route transition.
 */
export function resolveRouteFocus(input: RouteFocusInput = {}): RouteFocusTarget {
	const anchorId = anchorIdFromHash(input.hash ?? '');
	if (anchorId) {
		return { kind: 'heading-anchor', anchorId, announceRoute: false };
	}
	return { kind: 'route-landmark', announceRoute: true };
}
