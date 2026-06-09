/**
 * Color-independence primitive (UX-A11Y-007, WCAG 1.4.1 Use of Color).
 *
 * No state may be conveyed by colour alone. This module is the single source for the NON-colour cue
 * that must accompany every coloured indicator: a guaranteed text label (the AT/grayscale-safe
 * signal) plus an optional redundant icon shape and a decorative tone token. A semantic state
 * resolves through `resolveStateIndicator` so the same "bloodied" / "hidden" / "offline" wording and
 * shape appear everywhere (UX-A11Y-007 AC2/AC4), and a coloured chip can never ship without a label.
 *
 * Pure — no DOM. The matching `StateBadge.svelte` renders `{icon, label}`; form errors use
 * `fieldErrorAttributes` to wire `aria-invalid` + `aria-describedby` (UX-A11Y-007 AC3).
 */

import type { IconName } from '$lib/gui/icons';

/** A resolved non-colour cue for a semantic state. `label` is always present (the 1.4.1 floor). */
export interface StateIndicator {
	/** Visible/SR text — the guaranteed colour-independent signal. Never empty. */
	label: string;
	/** Optional registry icon adding a redundant shape cue (decorative when label is adjacent). */
	icon?: IconName;
	/** Decorative semantic colour token — applied ON TOP of label+icon, never as the sole signal. */
	toneToken?: string;
}

/** Visibility of an entity to the current actor (UX-A11Y-007 §visibility state). */
export type VisibilityState = 'visible' | 'hidden' | 'dm-only';

/** Combat health bands (UX-A11Y-007 §health state). */
export type HealthState = 'full' | 'bloodied' | 'critical' | 'dead';

/** Local-first sync state (UX-A11Y-007 §sync/offline state). */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'sync-error';

/** Generic severity (shares the status-icon shapes from the icon registry). */
export type StatusState = 'success' | 'warning' | 'error' | 'info';

const VISIBILITY: Readonly<Record<VisibilityState, StateIndicator>> = {
	visible: { label: 'Visible', icon: 'dm-only', toneToken: '--color-status-success' },
	hidden: { label: 'Hidden', icon: 'hidden', toneToken: '--color-text-tertiary' },
	'dm-only': { label: 'DM only', icon: 'dm-only', toneToken: '--color-dm-only-badge' },
};

const HEALTH: Readonly<Record<HealthState, StateIndicator>> = {
	full: { label: 'Healthy', icon: 'success', toneToken: '--color-status-success' },
	bloodied: { label: 'Bloodied', icon: 'warning', toneToken: '--color-status-warning' },
	critical: { label: 'Critical', icon: 'error', toneToken: '--color-status-error' },
	dead: { label: 'Down', icon: 'close', toneToken: '--color-status-error' },
};

const SYNC: Readonly<Record<SyncState, StateIndicator>> = {
	synced: { label: 'Synced', icon: 'success', toneToken: '--color-status-success' },
	syncing: { label: 'Syncing', icon: 'loading', toneToken: '--color-status-info' },
	offline: { label: 'Offline', icon: 'hidden', toneToken: '--color-text-tertiary' },
	'sync-error': { label: 'Sync error', icon: 'error', toneToken: '--color-status-error' },
};

const STATUS: Readonly<Record<StatusState, StateIndicator>> = {
	success: { label: 'Success', icon: 'success', toneToken: '--color-status-success' },
	warning: { label: 'Warning', icon: 'warning', toneToken: '--color-status-warning' },
	error: { label: 'Error', icon: 'error', toneToken: '--color-status-error' },
	info: { label: 'Info', icon: 'info', toneToken: '--color-status-info' },
};

const REGISTRIES = {
	visibility: VISIBILITY,
	health: HEALTH,
	sync: SYNC,
	status: STATUS,
} as const;

export type StateKind = keyof typeof REGISTRIES;

/**
 * Resolve the non-colour indicator for a semantic state. Throws on an unknown value (fail-closed) so
 * a state can never silently fall back to colour-only.
 */
export function resolveStateIndicator(kind: StateKind, value: string): StateIndicator {
	const registry = REGISTRIES[kind] as Record<string, StateIndicator>;
	const indicator = registry[value];
	if (!indicator) {
		throw new Error(`Unknown ${kind} state "${value}" — no colour-independent indicator defined.`);
	}
	return indicator;
}

/**
 * Contract check used by tests and dev: a state indicator is colour-independent only if it carries a
 * non-empty label (a text or shape cue that survives grayscale / colour removal — UX-A11Y-007 AC4).
 */
export function isColorIndependent(indicator: StateIndicator): boolean {
	return typeof indicator.label === 'string' && indicator.label.trim().length > 0;
}

/** ARIA wiring for an invalid form field (UX-A11Y-007 AC3): `aria-invalid` + `aria-describedby`. */
export interface FieldErrorAttributes {
	'aria-invalid': 'true';
	'aria-describedby': string;
	/** The id to put on the error-message element so `aria-describedby` resolves. */
	describedById: string;
}

/**
 * Build the attributes that associate a field with its inline error message. The message element
 * must render with `id={describedById}` and an error icon + text (never a red border alone).
 */
export function fieldErrorAttributes(fieldId: string): FieldErrorAttributes {
	const describedById = `${fieldId}-error`;
	return {
		'aria-invalid': 'true',
		'aria-describedby': describedById,
		describedById,
	};
}
