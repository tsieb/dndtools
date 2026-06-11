<script lang="ts">
	import type {
		VisibilityChangeConflict,
		VisibilityLevel,
		VisibilityToggleView,
	} from '@dndtools/core';
	import { tick } from 'svelte';
	import { visibilityAnnouncement } from '@dndtools/core';
	import Icon from '$lib/gui/Icon.svelte';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { VISIBILITY_STATE_ICON } from './visibility-icons';

	/**
	 * UX-PERM-001 — the DM 3-state inline visibility toggle: a 3-segment radio group (`shared` →
	 * `player-visible` → `dm-only`, all three always visible together when expanded — never a
	 * dropdown), each segment carrying icon + label, selection marked by `aria-checked` + filled
	 * background, never color alone.
	 *
	 * The parent passes the CORE-RESOLVED toggle model (`resolveContentVisibilityToggle` /
	 * `resolveSectionVisibilityToggle`), which is `null` for any non-DM actor — so this component is
	 * never mounted on a player/observer surface (AC3: not rendered, not hidden).
	 *
	 * Changing to `dm-only` while the entity has active player grants surfaces the inline conflict
	 * warning BEFORE the command is dispatched (AC2): the parent supplies `conflict(level)` (the
	 * core's `evaluateVisibilityChangeConflict`), and `onchange` fires only on confirm.
	 *
	 * `collapsible` renders the at-rest state (current-state icon only) that expands on
	 * hover/focus/click (UX-PERM-001 §inline placement); surfaces in edit mode pass `false` so the
	 * full group is persistently visible.
	 */
	interface Props {
		view: VisibilityToggleView;
		/** Distinguishes multiple toggles for AT users, e.g. "Content visibility — overview section". */
		label?: string;
		/** Core conflict check for a prospective level; return null when no warning is needed. */
		conflict?: (level: VisibilityLevel) => VisibilityChangeConflict | null;
		onchange: (level: VisibilityLevel) => void | Promise<void>;
		/** At rest show only the current-state icon; expand on hover/focus/click. */
		collapsible?: boolean;
		testid?: string;
	}

	let {
		view,
		label = 'Content visibility',
		conflict,
		onchange,
		collapsible = false,
		testid = 'visibility-toggle',
	}: Props = $props();

	const announcer = useLiveAnnouncer();

	// Sticky expansion: ACTIVATING the at-rest icon (click / Enter / Space — pointer, touch, and
	// keyboard parity) expands the group. Expansion is never a hover/focus side effect: swapping
	// the at-rest node out from under an in-flight press would detach the control mid-interaction.
	let expanded = $state(false);
	let groupEl = $state<HTMLElement | null>(null);

	async function expand(): Promise<void> {
		expanded = true;
		// Keyboard flow continues in the group: focus the currently-checked segment once rendered.
		await tick();
		const current = groupEl?.querySelector<HTMLElement>('[aria-checked="true"]');
		current?.focus();
	}
	// The level awaiting the AC2 conflict confirmation, or null when no warning is pending.
	let pendingLevel = $state<VisibilityLevel | null>(null);
	let pendingConflict = $state<VisibilityChangeConflict | null>(null);

	// Fail closed for the at-rest label: an unmatched current level reads as hidden-from-players.
	const currentSegment = $derived(
		view.segments.find((segment) => segment.level === view.current) ?? {
			level: 'dm-only' as const,
			shortLabel: 'Hidden from players',
			description: 'Only the DM can see this. Players will not know it exists.',
		},
	);

	async function apply(level: VisibilityLevel): Promise<void> {
		pendingLevel = null;
		pendingConflict = null;
		await onchange(level);
		// UX-PERM-001 §accessibility: announce the new state politely through the shared announcer.
		announcer?.announce(visibilityAnnouncement(level), 'polite');
	}

	async function select(level: VisibilityLevel): Promise<void> {
		if (level === view.current) return;
		// AC2: evaluate the conflict BEFORE dispatching; the warning intercepts the command.
		const warning = conflict?.(level) ?? null;
		if (warning) {
			pendingLevel = level;
			pendingConflict = warning;
			return;
		}
		await apply(level);
	}

	function cancelConflict(): void {
		pendingLevel = null;
		pendingConflict = null;
	}

	// `←`/`→` cycle states from the focused segment (UX-PERM-001 §input).
	function onSegmentKeydown(event: KeyboardEvent, index: number): void {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const delta = event.key === 'ArrowLeft' ? -1 : 1;
		const next = view.segments[(index + delta + view.segments.length) % view.segments.length];
		if (next) void select(next.level);
	}
</script>

<div class="vis-toggle" class:vis-collapsible={collapsible && !expanded} data-testid={testid}>
	{#if collapsible && !expanded}
		<!-- At rest: current-state icon only (16px glyph in a 32px target); expand on interaction. -->
		<button
			type="button"
			class="vis-rest"
			aria-expanded="false"
			aria-label={`${label}: ${currentSegment.shortLabel}. Activate to change.`}
			data-testid={`${testid}-expand`}
			onclick={expand}
		>
			<Icon name={VISIBILITY_STATE_ICON[view.current]} size="sm" />
		</button>
	{:else}
		<div
			bind:this={groupEl}
			class="vis-group"
			role="radiogroup"
			aria-label={label}
			data-testid={`${testid}-group`}
		>
			{#each view.segments as segment, index (segment.level)}
				<button
					type="button"
					class="vis-segment"
					role="radio"
					aria-checked={segment.level === view.current}
					title={segment.description}
					data-testid={`${testid}-segment-${segment.level}`}
					onclick={() => select(segment.level)}
					onkeydown={(event) => onSegmentKeydown(event, index)}
				>
					<!-- Decorative icon; the visible label is the accessible name (never color alone). -->
					<Icon name={VISIBILITY_STATE_ICON[segment.level]} size="micro" />
					<span class="vis-segment-label">{segment.shortLabel}</span>
				</button>
			{/each}
		</div>
		{#if view.inherited}
			<!-- Section/field granularity: show that the current state is inherited from the entity. -->
			<span class="meta vis-inherited" data-testid={`${testid}-inherited`}>
				Inherited from the entity default
			</span>
		{/if}
	{/if}

	{#if pendingConflict && pendingLevel}
		<!-- UX-PERM-001 AC2: inline (non-modal) warning shown BEFORE the dm-only command dispatches. -->
		<div class="vis-conflict" role="alert" data-testid={`${testid}-conflict`}>
			<Icon name="warning" size="sm" class="icon-status-warning" />
			<span class="vis-conflict-text">{pendingConflict.message}</span>
			<div class="vis-conflict-actions">
				<button
					type="button"
					data-testid={`${testid}-conflict-confirm`}
					onclick={() => pendingLevel && apply(pendingLevel)}
				>
					{pendingConflict.confirmLabel}
				</button>
				<button type="button" data-testid={`${testid}-conflict-cancel`} onclick={cancelConflict}>
					{pendingConflict.cancelLabel}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.vis-toggle {
		display: inline-flex;
		flex-direction: column;
		gap: var(--space-1);
		vertical-align: middle;
	}
	/* At-rest affordance: 16px glyph, ≥32px mouse target (UX-PERM-001 §states). */
	.vis-rest {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 32px;
		min-height: 32px;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.vis-rest:hover,
	.vis-rest:focus-visible {
		border-color: var(--color-border-strong);
		color: var(--color-text-primary);
	}
	/* The 3-segment group: all three states visible simultaneously — never a dropdown. */
	.vis-group {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.vis-segment {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		padding: 0 var(--space-2);
		border: 0;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.vis-segment + .vis-segment {
		border-left: 1px solid var(--color-border);
	}
	.vis-segment:hover {
		background: var(--color-interactive-hover);
	}
	/* Selection cue: filled background + icon + label + aria-checked — never color alone. */
	.vis-segment[aria-checked='true'] {
		background: var(--color-interactive-selected);
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
	}
	/* Touch profiles: segments grow to the 44px recommended target (UX-PERM-001 §platform). */
	:global(html[data-input-modality='touch']) .vis-segment,
	:global(html[data-input-modality='touch']) .vis-rest {
		min-height: var(--touch-target-min);
	}
	.vis-inherited {
		font-size: var(--text-xs);
	}
	/* AC2 inline conflict warning (warning tokens; non-modal, one dismiss). */
	.vis-conflict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		max-width: 36rem;
		padding: var(--space-2);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-sm);
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
		font-size: var(--text-sm);
	}
	.vis-conflict-text {
		flex: 1 1 16rem;
	}
	.vis-conflict-actions {
		display: flex;
		gap: var(--space-2);
	}
	.vis-conflict-actions button {
		min-height: 32px;
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		cursor: pointer;
	}
	:global(html[data-input-modality='touch']) .vis-conflict-actions button {
		min-height: var(--touch-target-min);
	}
</style>
