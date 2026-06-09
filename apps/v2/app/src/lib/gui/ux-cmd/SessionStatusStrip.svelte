<script lang="ts">
	import type { SessionStatusStrip } from '@dndtools/v2-core';

	/**
	 * UX-CMD-003 — the glanceable session status strip. A fixed-height, always-visible region at the top
	 * of the Command Center that surfaces session phase, current combat turn, connected players, and
	 * audio WITHOUT any interaction (the "glance contract"). Every cell is rendered from the
	 * already-viewer-filtered {@link SessionStatusStrip} read model, so the strip can never reveal a
	 * hidden combatant, the DM's audio config, or (for a participant) the table roster.
	 *
	 * Non-colour state (UX-CMD-003 §9.5 / WCAG 1.4.1): every cell carries a text label in addition to its
	 * tone; the paused phase shows a static "Paused" label and only adds a pulse when motion is allowed
	 * (the `[data-motion]` contract — UX-CMD-003 §9.7).
	 */
	interface Props {
		strip: SessionStatusStrip;
	}

	let { strip }: Props = $props();
</script>

<section
	class="cc-status-strip"
	role="status"
	aria-label="Session status"
	data-testid="cc-status-strip"
>
	<div class="cc-status-cell phase" data-testid="cc-status-phase" data-tone={strip.phase.tone}>
		<span class="cc-status-key">Session</span>
		<span
			class="cc-status-badge"
			data-tone={strip.phase.tone}
			data-attention={strip.phase.attention ? 'true' : 'false'}
		>
			{strip.phase.label}
		</span>
	</div>

	<div class="cc-status-cell turn" data-testid="cc-status-turn">
		<span class="cc-status-key">Current turn</span>
		<span class="cc-status-value">
			{strip.turn.label}
			{#if strip.turn.activeName && strip.turn.initiative !== null}
				<span class="cc-status-sub">init {strip.turn.initiative}</span>
			{/if}
			{#if strip.turn.round !== null}
				<span class="cc-status-sub">round {strip.turn.round}</span>
			{/if}
		</span>
	</div>

	{#if strip.players}
		<div class="cc-status-cell players" data-testid="cc-status-players">
			<span class="cc-status-key">Players</span>
			<span class="cc-status-value">{strip.players.label}</span>
		</div>
	{/if}

	<div class="cc-status-cell audio" data-testid="cc-status-audio" data-playing={strip.audio.playing}>
		<span class="cc-status-key">Audio</span>
		<span class="cc-status-value">{strip.audio.playing ? strip.audio.label : 'Silent'}</span>
	</div>

	{#if strip.observerMode}
		<div class="cc-status-cell observer" data-testid="cc-status-observer">
			<span class="cc-status-badge" data-tone="observer">Observer mode</span>
		</div>
	{/if}
</section>

<style>
	.cc-status-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-5);
		min-height: 48px;
		padding: var(--space-2) var(--space-4);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.cc-status-cell {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		min-width: 0;
		padding-right: var(--space-4);
		border-right: 1px solid var(--color-border);
	}

	.cc-status-cell:last-child {
		border-right: none;
		padding-right: 0;
	}

	.cc-status-key {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
	}

	.cc-status-value {
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cc-status-sub {
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}

	.cc-status-badge {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		padding: var(--space-0-5) var(--space-2);
		border-radius: var(--radius-full, 999px);
		font-size: var(--text-xs);
		font-weight: 600;
		border: 1px solid var(--color-border-strong);
		color: var(--color-text-primary);
		background: var(--color-surface-overlay);
	}

	.cc-status-badge[data-tone='live'] {
		background: var(--color-status-success-subtle);
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
	}

	.cc-status-badge[data-tone='paused'] {
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
		border-color: var(--color-status-warning);
	}

	.cc-status-badge[data-tone='ending'] {
		background: var(--color-status-error-subtle);
		color: var(--color-status-error-text);
		border-color: var(--color-status-error);
	}

	.cc-status-badge[data-tone='observer'] {
		background: var(--color-status-info-subtle);
		color: var(--color-status-info-text);
		border-color: var(--color-status-info);
	}

	/* Paused requests attention via a gentle pulse — only when motion is permitted. The static label
	   ("Paused") already communicates the state, so reduced motion loses nothing (UX-CMD-003 §9.7). */
	.cc-status-badge[data-attention='true'] {
		animation: cc-status-pulse 1.6s ease-in-out infinite;
	}

	@keyframes cc-status-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.55;
		}
	}

	:global([data-motion='reduced']) .cc-status-badge[data-attention='true'],
	:global([data-motion='none']) .cc-status-badge[data-attention='true'] {
		animation: none;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(:not([data-motion])) .cc-status-badge[data-attention='true'] {
			animation: none;
		}
	}
</style>
