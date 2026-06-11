<script lang="ts">
	import type { VisibilityBadgeView } from '@dndtools/core';
	import Icon from '$lib/gui/Icon.svelte';
	import { VISIBILITY_STATE_ICON } from './visibility-icons';

	/**
	 * UX-PERM-007 — the ambient visibility badge on a content item: icon + label text in a compact
	 * chip, never color alone. The parent passes the CORE-RESOLVED badge model
	 * (`resolveContentVisibilityBadge`), which is `null` for any non-DM actor — so this component is
	 * simply never mounted on a player/observer surface (AC3 no-leak: absence, not hiding). The
	 * `dm-only` state is the critical one: the amber/violet DM-boundary chip is always visible
	 * without interaction (AC1); `mixed` carries the review tooltip (AC2).
	 */
	interface Props {
		badge: VisibilityBadgeView;
		/** Test-id suffix so list rows can be addressed individually. */
		testid?: string;
	}

	let { badge, testid = 'visibility-badge' }: Props = $props();
</script>

<span
	class="vis-badge"
	class:vis-badge-dm-only={badge.emphasized}
	role="img"
	aria-label={badge.ariaLabel}
	title={badge.tooltip ?? badge.ariaLabel}
	data-testid={testid}
	data-state={badge.state}
>
	<!-- Icon is decorative: the chip itself carries the accessible name (UX-PERM-007 §accessibility). -->
	<Icon name={VISIBILITY_STATE_ICON[badge.state]} size="micro" />
	<span class="vis-badge-label">{badge.label}</span>
</span>

<style>
	/* UX-PERM-007 §badge anatomy: compact chip, icon + short muted label, token colours only. */
	.vis-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 20px;
		padding: 0 var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		line-height: 1;
		white-space: nowrap;
		vertical-align: middle;
	}
	/* The critical state: the DM-visibility-boundary token group (doc 01), not a status colour. */
	.vis-badge-dm-only {
		border-color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
		color: var(--color-dm-only-badge);
	}
	.vis-badge-label {
		font-weight: var(--font-weight-semibold);
	}
</style>
