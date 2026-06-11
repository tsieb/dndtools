import type { VisibilityBadgeState } from '@dndtools/core';
import type { IconName } from '$lib/gui/icons';

/**
 * UX-PERM-001 / UX-PERM-007 — the reserved eye-family icon vocabulary for VISIBILITY state.
 *
 * Mapping the core's semantic visibility states to registry icon names is a GUI concern; the core
 * model stays icon-agnostic. This is the single mapping every UX-PERM surface (toggle segments,
 * ambient badges) uses, so the vocabulary cannot drift: `shared` = person-group, `player-visible` =
 * eye-open, `dm-only` = eye-slash, `mixed` = layered glyph. Permission GRANTS use a different icon
 * family (key) per UX-PERM-001 §visual vocabulary separation.
 */
export const VISIBILITY_STATE_ICON: Readonly<Record<VisibilityBadgeState, IconName>> = {
	shared: 'visibility-shared',
	'player-visible': 'visibility-players',
	'dm-only': 'visibility-hidden',
	mixed: 'visibility-mixed',
};
