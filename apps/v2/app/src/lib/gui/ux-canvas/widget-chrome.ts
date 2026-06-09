/**
 * Widget chrome + binding-state model (UX-CANVAS-007 / UX-CANVAS-008 / UX-CANVAS-011). Pure, no DOM.
 *
 * Derives the glanceable, NON-COLOUR-ONLY chrome a widget shows on the spatial canvas:
 *   • the data-binding indicator state (none / active / missing / conflicted / hidden) and its
 *     accessible label, plus the SAFE entity name to show (the bound entity id is revealed to a DM
 *     only, or to a non-DM whose per-actor binding resolution already exposes it — never otherwise),
 *   • the player-visibility badge descriptor (DM-only / Players / Shared) with a redundant text label
 *     and icon key so the boundary survives a grayscale + squint test (UX-CANVAS-007 AC3),
 *   • the collapse and visibility-toggle copy used by the accessible chrome panel.
 *
 * NO-LEAK (actor safety): {@link safeBindingEntityId} is the single choke point that decides whether a
 * bound entity id may appear in ANY chrome surface (tile title, binding badge, outline name, panel).
 * A non-DM only ever sees the id when the Processing Core's per-actor binding resolution already
 * returned the widget as `available`/`degraded` for them; for `missing`/`hidden`/`conflicted`/`unbound`
 * the id is withheld, so a player-visible widget bound to a DM-only entity never leaks that entity id.
 */

import type { ActorRole, SceneVisibility } from '@dndtools/v2-core';

/** The per-actor binding-resolution kind the route reads off the Processing Core scene summary. */
export type BindingResolutionKind =
	| 'available'
	| 'degraded'
	| 'missing'
	| 'conflicted'
	| 'unbound'
	| 'hidden'
	| 'disabled'
	| 'none';

/** The glanceable binding-indicator state rendered on the chain-link chrome + binding panel. */
export type WidgetBindingState = 'none' | 'active' | 'missing' | 'conflicted' | 'hidden';

/**
 * Map a (binding-present?, per-actor resolution) pair to the chain-link indicator state.
 *   - no binding at all ⇒ `none`
 *   - resolved/available or degraded ⇒ `active`
 *   - entity not found ⇒ `missing`
 *   - unresolved conflict ⇒ `conflicted`
 *   - redacted for this actor (`hidden`) or not yet bound (`unbound`/`disabled`) ⇒ `hidden`/`none`
 */
export function bindingState(hasBinding: boolean, resolution: BindingResolutionKind): WidgetBindingState {
	if (!hasBinding) return 'none';
	switch (resolution) {
		case 'available':
		case 'degraded':
			return 'active';
		case 'missing':
			return 'missing';
		case 'conflicted':
			return 'conflicted';
		case 'hidden':
			return 'hidden';
		default:
			return 'none';
	}
}

/**
 * THE no-leak choke point for a bound entity id. Returns the id ONLY when the viewer may see it: a DM
 * sees every binding; a non-DM sees the id solely when their per-actor resolution returned the widget
 * as `available`/`degraded` (the Core already decided the binding is visible to them). Every other
 * resolution withholds the id, so a player-visible widget bound to a DM-only entity never leaks it.
 */
export function safeBindingEntityId(
	resolution: BindingResolutionKind,
	rawEntityId: string | undefined,
	viewerRole: ActorRole,
): string | undefined {
	if (!rawEntityId) return undefined;
	if (viewerRole === 'dm') return rawEntityId;
	return resolution === 'available' || resolution === 'degraded' ? rawEntityId : undefined;
}

export interface BindingChrome {
	state: WidgetBindingState;
	/** Accessible label for the chain-link indicator. */
	ariaLabel: string;
	/** Short glanceable label shown beside the chain-link. */
	label: string;
	/** True when the content area should render an explicit placeholder instead of data. */
	showPlaceholder: boolean;
	/** Placeholder copy for the content area (missing/conflicted/hidden), or null when active/none. */
	placeholder: string | null;
	/** True when a "Rebind" recovery action should be offered (UX-CANVAS-007 AC4). */
	canRebind: boolean;
}

/** Build the binding chrome descriptor for one widget, given its state + the SAFE entity name. */
export function bindingChrome(state: WidgetBindingState, safeEntityName?: string): BindingChrome {
	switch (state) {
		case 'active':
			return {
				state,
				ariaLabel: safeEntityName ? `Data binding: ${safeEntityName}` : 'Data binding active',
				label: safeEntityName ? `Bound: ${safeEntityName}` : 'Bound',
				showPlaceholder: false,
				placeholder: null,
				canRebind: false,
			};
		case 'missing':
			return {
				state,
				ariaLabel: 'Data binding missing',
				label: 'Binding missing',
				showPlaceholder: true,
				placeholder: 'Binding missing',
				canRebind: true,
			};
		case 'conflicted':
			return {
				state,
				ariaLabel: 'Data binding conflicted',
				label: 'Binding conflicted',
				showPlaceholder: true,
				placeholder: 'Binding conflicted',
				canRebind: true,
			};
		case 'hidden':
			return {
				state,
				ariaLabel: 'Data binding hidden in this view',
				label: 'Hidden',
				showPlaceholder: true,
				// Never a zero/stale value that could be mistaken for real data (UX-CANVAS-008 §hidden).
				placeholder: 'Hidden in this view',
				canRebind: false,
			};
		default:
			return {
				state: 'none',
				ariaLabel: 'No data binding',
				label: 'No binding',
				showPlaceholder: false,
				placeholder: null,
				canRebind: false,
			};
	}
}

/** A safe, glanceable widget title that never embeds a hidden bound entity id. */
export function safeWidgetTitle(type: string, safeEntityName?: string): string {
	return safeEntityName ? `${type} — ${safeEntityName}` : `${type} widget`;
}

export type VisibilityBadgeKind = 'dm-only' | 'players' | 'shared';

export interface VisibilityBadge {
	kind: VisibilityBadgeKind;
	/** Redundant text label (never colour-only) — survives a grayscale test (UX-CANVAS-007 AC3). */
	label: string;
	ariaLabel: string;
	/** Icon key the renderer maps to a glyph (closed-eye / open-eye / partial-eye). */
	icon: 'eye-off' | 'eye' | 'eye-partial';
}

/** Build the player-visibility badge descriptor for a widget's declared visibility. */
export function visibilityBadge(visibility: SceneVisibility): VisibilityBadge {
	switch (visibility) {
		case 'player-visible':
			return { kind: 'players', label: 'Players', ariaLabel: 'Visible to all players', icon: 'eye' };
		case 'shared':
			return { kind: 'shared', label: 'Shared', ariaLabel: 'Shared with selected players', icon: 'eye-partial' };
		default:
			return { kind: 'dm-only', label: 'DM Only', ariaLabel: 'Hidden from players', icon: 'eye-off' };
	}
}

export interface VisibilityToggle {
	/** The visibility this widget moves to when the DM toggles it (UX-CANVAS-011 §Change visibility). */
	next: SceneVisibility;
	/** Button copy for the toggle. */
	label: string;
	/** Polite live-region announcement on success. */
	announce: (widgetLabel: string) => string;
}

/**
 * The single-tap visibility toggle (≤2 interactions: select + toggle — UX-CANVAS-011). A `dm-only`
 * widget reveals to all players; anything player-facing hides back to DM-only.
 */
export function visibilityToggle(current: SceneVisibility): VisibilityToggle {
	if (current === 'dm-only') {
		return {
			next: 'player-visible',
			label: 'Show to players',
			announce: (w) => `${w} is now visible to players.`,
		};
	}
	return {
		next: 'dm-only',
		label: 'Hide from players',
		announce: (w) => `${w} is now hidden from players.`,
	};
}

/** Collapse-toggle copy + the next collapsed value (UX-CANVAS-007 §Collapse toggle). */
export function collapseToggle(collapsed: boolean): { next: boolean; label: string; ariaExpanded: boolean } {
	return { next: !collapsed, label: collapsed ? 'Expand widget' : 'Collapse widget', ariaExpanded: !collapsed };
}

/** Read a widget's persisted collapsed flag from its configuration (defaults to expanded). */
export function isCollapsed(configuration: Record<string, unknown>): boolean {
	return configuration.collapsed === true;
}
