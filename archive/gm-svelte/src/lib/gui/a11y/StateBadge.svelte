<script lang="ts">
	import Icon from '$lib/gui/Icon.svelte';
	import { resolveStateIndicator, type StateKind } from './state-indicator';

	/**
	 * Colour-independent state badge (UX-A11Y-007). Renders a semantic state as a redundant icon shape
	 * PLUS a visible text label, with the tone colour applied on top — never colour alone (WCAG 1.4.1).
	 * The label survives grayscale / colour-removal and is read by screen readers (UX-A11Y-007 AC2/AC4).
	 */
	interface Props {
		kind: StateKind;
		value: string;
		/** Visually hide the text but keep it for AT (when adjacent context already shows the label). */
		labelHidden?: boolean;
		testid?: string;
	}

	let { kind, value, labelHidden = false, testid }: Props = $props();
	const indicator = $derived(resolveStateIndicator(kind, value));
</script>

<span class="status-chip state-badge" data-testid={testid} data-state={`${kind}:${value}`}>
	{#if indicator.icon}
		<Icon name={indicator.icon} size="micro" label={labelHidden ? indicator.label : undefined} />
	{/if}
	<span class:visually-hidden={labelHidden}>{indicator.label}</span>
</span>
