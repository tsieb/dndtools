import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import { isLiveContentItem } from '../state/content';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';
import { isGrantActive } from '../permissions/grant-records';

/**
 * UX-PERM-001 / UX-PERM-007 — the DM visibility-control and ambient-badge read models.
 *
 * Both models are DM-ONLY, DEFAULT-DENY choke points (the same pattern as
 * `resolveSectionRouteAccess`): every resolver returns `null` unless the requesting actor exists AND
 * is the DM, so a player/observer surface that renders "whatever the core returned" renders NOTHING —
 * no toggle, no badge, no hint that a visibility state even exists (UX-PERM-001 AC3, UX-PERM-007 AC3,
 * principle 8 must-never-leak). The GUI never branches on role itself; it renders the returned model
 * or its absence.
 */

// --- UX-PERM-001 — the 3-state toggle model ------------------------------------------------------

/** One segment of the 3-state toggle: a visibility level with its canonical icon-family copy. */
export interface VisibilityToggleSegment {
	level: VisibilityLevel;
	/** Short label shown in the segment (UX-PERM-001 §three states table). */
	shortLabel: string;
	/** Explanatory tooltip copy (UX-PERM-001 §three states table). */
	description: string;
}

/**
 * The canonical segment order: most exposed → most restricted reading left → right as specified by
 * UX-PERM-001 (`shared` left, `player-visible` center/default, `dm-only` right). Module-level
 * immutable constant — the order is part of the UI contract and identical on every surface.
 */
export const VISIBILITY_TOGGLE_SEGMENTS: readonly VisibilityToggleSegment[] = Object.freeze([
	{
		level: 'shared',
		shortLabel: 'Shared with specific players',
		description:
			'Players who have been individually granted access or received a handout can see this.',
	},
	{
		level: 'player-visible',
		shortLabel: 'Players can see this',
		description: 'All players in the session can see this. No individual grant required.',
	},
	{
		level: 'dm-only',
		shortLabel: 'Hidden from players',
		description: 'Only the DM can see this. Players will not know it exists.',
	},
] as VisibilityToggleSegment[]);

/** The toggle model for one target (a content item entity, or one of its sections). */
export interface VisibilityToggleView {
	/** Always the three canonical segments in canonical order. */
	segments: readonly VisibilityToggleSegment[];
	/** The target's CURRENT authored level (for a section: its override, else the inherited level). */
	current: VisibilityLevel;
	/** For a section target: whether `current` is inherited from the entity (no own override). */
	inherited: boolean;
	/** Live-region announcement template result for the current state ("Visibility set to: …"). */
	announcement: string;
}

/** The polite announcement for a (newly applied) visibility level (UX-PERM-001 §accessibility). */
export function visibilityAnnouncement(level: VisibilityLevel): string {
	const segment = VISIBILITY_TOGGLE_SEGMENTS.find((entry) => entry.level === level);
	return `Visibility set to: ${segment?.shortLabel ?? 'Hidden from players'}`;
}

/** True when the actor is a known DM — the single role gate for every resolver in this module. */
function isDm(permissions: PermissionState, actorId: string): boolean {
	return permissions.actors[actorId]?.role === 'dm';
}

/**
 * UX-PERM-001 — resolve the ENTITY-level toggle for one content item. Returns `null` (toggle not
 * rendered, not hidden via CSS) unless the actor is the DM AND the item exists and is live.
 */
export function resolveContentVisibilityToggle(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	itemId: string,
): VisibilityToggleView | null {
	if (!isDm(permissions, actorId)) return null;
	const item = content.items[itemId];
	if (!item || !isLiveContentItem(item)) return null;
	const current = normalizeVisibilityLevel(item.visibility);
	return {
		segments: VISIBILITY_TOGGLE_SEGMENTS,
		current,
		inherited: false,
		announcement: visibilityAnnouncement(current),
	};
}

/**
 * UX-PERM-001 §section granularity — resolve the SECTION-level toggle for one named section of a
 * content item. `current` is the section's own override when present, else the entity level
 * (`inherited: true`) so the control can show the effective state in both cases. DM-only, fail
 * closed exactly like the entity toggle.
 */
export function resolveSectionVisibilityToggle(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	itemId: string,
	sectionId: string,
): VisibilityToggleView | null {
	if (!isDm(permissions, actorId)) return null;
	const item = content.items[itemId];
	if (!item || !isLiveContentItem(item)) return null;
	const override = item.sectionVisibility[sectionId];
	const current = override
		? normalizeVisibilityLevel(override.level)
		: normalizeVisibilityLevel(item.visibility);
	return {
		segments: VISIBILITY_TOGGLE_SEGMENTS,
		current,
		inherited: !override,
		announcement: visibilityAnnouncement(current),
	};
}

// --- UX-PERM-001 AC2 — the dm-only conflict warning ----------------------------------------------

/** The inline warning shown BEFORE a `dm-only` change is dispatched while grants are active. */
export interface VisibilityChangeConflict {
	/** Number of ACTIVE (non-expired) player grants on the entity. Always ≥ 1 when returned. */
	activeGrantCount: number;
	/** The warning body copy (UX-PERM-001 §change to dm-only with active grants). */
	message: string;
	confirmLabel: string;
	cancelLabel: string;
}

export const VISIBILITY_CONFLICT_MESSAGE =
	'This content has active player access grants. Hiding it will create a permission conflict.';

/**
 * UX-PERM-001 AC2 — evaluate whether changing an entity to `dm-only` must first surface the inline
 * conflict warning. Returns the warning model when the next level is `dm-only` AND at least one
 * ACTIVE player grant exists on the entity; `null` otherwise (no warning — dispatch immediately).
 * The grant itself is NOT auto-revoked; confirming proceeds and flags the conflict for the DM's
 * diagnostics surface (PERM-007).
 */
export function evaluateVisibilityChangeConflict(
	permissions: PermissionState,
	entityType: string,
	entityId: string,
	nextLevel: VisibilityLevel,
	now?: string,
): VisibilityChangeConflict | null {
	if (normalizeVisibilityLevel(nextLevel) !== 'dm-only') return null;
	const activeGrantCount = permissions.grants.filter(
		(grant) =>
			grant.entityType === entityType &&
			grant.entityId === entityId &&
			isGrantActive(grant, now),
	).length;
	if (activeGrantCount === 0) return null;
	return {
		activeGrantCount,
		message: VISIBILITY_CONFLICT_MESSAGE,
		confirmLabel: 'Hide anyway and flag conflict',
		cancelLabel: 'Cancel',
	};
}

// --- UX-PERM-007 — the ambient visibility badge --------------------------------------------------

/** Badge states: the three visibility levels plus `mixed` (granular overrides differ). */
export type VisibilityBadgeState = VisibilityLevel | 'mixed';

/** The ambient badge model for one content item, as rendered on DM list surfaces. */
export interface VisibilityBadgeView {
	state: VisibilityBadgeState;
	/** Short chip label (icon + label, never color alone — UX-PERM-007 §badge anatomy). */
	label: string;
	/** Accessible name: `role="img"` + this label (UX-PERM-007 §accessibility). */
	ariaLabel: string;
	/** `dm-only` is the critical state: amber chip, always visible without interaction (AC1). */
	emphasized: boolean;
	/** Mixed-state tooltip; absent for the plain states. */
	tooltip?: string;
}

const BADGE_LABELS: Record<VisibilityBadgeState, string> = {
	'dm-only': 'DM only',
	'player-visible': 'Players',
	shared: 'Shared',
	mixed: 'Mixed',
};

const BADGE_ARIA: Record<VisibilityBadgeState, string> = {
	'dm-only': 'Visibility: Hidden from players',
	'player-visible': 'Visibility: Players can see this',
	shared: 'Visibility: Shared with specific players',
	mixed: 'Visibility: Mixed',
};

export const MIXED_BADGE_TOOLTIP =
	'Some sections or fields have different visibility. Click to review.';

/**
 * UX-PERM-007 — resolve the ambient visibility badge for one content item. DM-only, default-deny:
 * a player/observer/unknown actor gets `null`, so their list rows carry NO badge and no implied
 * existence of hidden states (AC3). The `mixed` state wins whenever any section- or field-level
 * override differs from the entity level (AC2); otherwise the badge mirrors the entity level, with
 * `dm-only` emphasized so it is discoverable without interaction (AC1).
 */
export function resolveContentVisibilityBadge(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	itemId: string,
): VisibilityBadgeView | null {
	if (!isDm(permissions, actorId)) return null;
	const item = content.items[itemId];
	if (!item || !isLiveContentItem(item)) return null;
	const entityLevel = normalizeVisibilityLevel(item.visibility);
	const overrides = [
		...Object.values(item.sectionVisibility),
		...Object.values(item.fieldVisibility),
	];
	const mixed = overrides.some(
		(rule) => normalizeVisibilityLevel(rule.level) !== entityLevel,
	);
	const state: VisibilityBadgeState = mixed ? 'mixed' : entityLevel;
	return {
		state,
		label: BADGE_LABELS[state],
		ariaLabel: BADGE_ARIA[state],
		emphasized: state === 'dm-only',
		...(state === 'mixed' ? { tooltip: MIXED_BADGE_TOOLTIP } : {}),
	};
}
