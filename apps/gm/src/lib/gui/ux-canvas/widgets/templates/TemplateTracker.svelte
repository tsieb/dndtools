<script lang="ts">
	/**
	 * Tracker template (the Timer widget). Renders a live `M:SS` countdown with a depleting bar and
	 * operate controls that dispatch the widget's declared timer commands through the surface. The
	 * countdown is derived by the Processing Core's `getTimerCountdown` read model from durable timer
	 * state; the tick only re-reads the clock (no GUI-owned timer truth).
	 */
	import { getTimerCountdown, type WidgetDefinition, type WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import type { WidgetCommandDispatcher } from '../widget-render-types';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
		onCommand?: WidgetCommandDispatcher;
	}
	const { widget = null, config, onCommand }: Props = $props();
	const runtime = useRuntime();

	const duration = $derived.by(() => {
		const n = Number(config.durationSeconds);
		return Number.isFinite(n) && n > 0 ? n : 60;
	});

	let now = $state(new Date().toISOString());
	const timer = $derived(widget ? runtime.state.session.timers[widget.id] : undefined);

	// Only re-read the clock while the durable timer is actually running — a paused/stopped timer's
	// countdown does not depend on `now`, so ticking it would re-render every second for no change.
	// Keyed on `timer?.status` (stable across ticks), not the per-tick `countdown` object.
	$effect(() => {
		if (timer?.status !== 'running') return;
		const id = setInterval(() => (now = new Date().toISOString()), 1000);
		return () => clearInterval(id);
	});

	const countdown = $derived(getTimerCountdown(timer, now, duration));
	const interactive = $derived(!!onCommand && !!widget);

	function run(commandType: string, payload: Record<string, unknown> = {}) {
		void onCommand?.(commandType, payload);
	}
</script>

<div class="tpl-tracker" data-widget-template="tracker">
	<div class="tpl-readout" data-testid="widget-timer-readout">
		<span class="tpl-time" data-urgency={countdown.urgency}>{countdown.display}</span>
		<span class="tpl-status">{countdown.statusLabel}</span>
	</div>
	<div class="tpl-bar" aria-hidden="true">
		<span class="tpl-bar-fill" style={`width: ${Math.round(countdown.fractionRemaining * 100)}%`}
		></span>
	</div>
	<div class="tpl-actions" role="group" aria-label="Timer controls">
		{#if countdown.status === 'running'}
			<button type="button" disabled={!interactive} onclick={() => run('timer.pause')}>Pause</button
			>
		{:else if countdown.status === 'paused'}
			<button type="button" disabled={!interactive} onclick={() => run('timer.resume')}
				>Resume</button
			>
		{:else}
			<button
				type="button"
				disabled={!interactive}
				onclick={() => run('timer.start', { durationSeconds: duration })}
				data-testid="widget-timer-start">Start</button
			>
		{/if}
		<button type="button" disabled={!interactive} onclick={() => run('timer.reset')}>Reset</button>
		<button type="button" disabled={!interactive} onclick={() => run('timer.advance', { deltaSeconds: -30 })}
			>−30s</button
		>
	</div>
</div>

<style>
	.tpl-tracker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-readout {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.tpl-time {
		font-size: var(--text-2xl, 1.75rem);
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-bold);
	}
	.tpl-status {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.tpl-bar {
		height: var(--space-1-5);
		border-radius: var(--radius-full);
		background: var(--color-surface-sunken, var(--color-border));
		overflow: hidden;
	}
	.tpl-bar-fill {
		display: block;
		height: 100%;
		background: var(--widget-accent, var(--color-accent));
		transition: width var(--duration-crawl) linear;
	}
	@media (prefers-reduced-motion: reduce) {
		.tpl-bar-fill {
			transition: none;
		}
	}
	.tpl-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.tpl-actions button {
		min-height: var(--touch-target-min);
		padding: var(--space-0-5) var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.tpl-actions button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
