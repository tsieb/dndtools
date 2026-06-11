<script lang="ts">
	import { hpRatio, hpTone } from './hp-tone';

	// UX-CHAR-011 — the at-a-glance HP meter. `role="meter"` with aria-valuenow/min/max so a screen
	// reader announces the value; the fill colour encodes the tone non-redundantly (the numerals carry
	// the same information, so colour is never the only signal — WCAG 1.4.1).
	interface Props {
		hp: number;
		maxHp: number;
		tempHp?: number;
		/** Accessible name prefix, e.g. the character name, so the meter announces "Thorin hit points". */
		label: string;
		testid?: string;
	}
	const { hp, maxHp, tempHp = 0, label, testid }: Props = $props();

	const ratio = $derived(hpRatio(hp, maxHp));
	const tone = $derived(hpTone(hp, maxHp));
	const pct = $derived(Math.round(ratio * 100));
</script>

<div class="hpbar" data-testid={testid} data-tone={tone}>
	<div
		class="track"
		role="meter"
		aria-valuenow={hp}
		aria-valuemin={0}
		aria-valuemax={maxHp}
		aria-label={`${label} hit points: ${hp} of ${maxHp}`}
	>
		<div class="fill" data-tone={tone} style:width={`${pct}%`}></div>
	</div>
	<div class="numerals">
		<span class="current">{hp}</span><span class="sep">/</span><span class="max">{maxHp}</span>
		{#if tempHp > 0}
			<span class="temp" data-testid={testid ? `${testid}-temp` : undefined}>+{tempHp} temp</span>
		{/if}
	</div>
</div>

<style>
	.hpbar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.track {
		position: relative;
		flex: 1 1 auto;
		min-width: var(--space-12);
		height: var(--space-2);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: inherit;
		/* `--duration-fast` is globally zeroed under prefers-reduced-motion, so no extra query needed. */
		transition: width var(--duration-fast) var(--ease-out, ease-out);
	}
	.fill[data-tone='high'] {
		background: var(--color-status-success);
	}
	.fill[data-tone='mid'] {
		background: var(--color-status-warning);
	}
	.fill[data-tone='low'] {
		background: var(--color-status-error);
	}
	.numerals {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-0-5);
		font-variant-numeric: tabular-nums;
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	.current {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.sep,
	.max {
		color: var(--color-text-secondary);
	}
	.temp {
		margin-left: var(--space-1);
		color: var(--color-status-info-text);
		font-size: var(--text-xs);
	}
</style>
