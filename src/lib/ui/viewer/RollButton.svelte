<script lang="ts">
	import { onDestroy } from 'svelte';
	import { diceState } from '$lib/state/dice.svelte.js';

	interface Props {
		expression: string;
	}

	let { expression }: Props = $props();
	let showingResult = $state(false);
	let resultText = $state('');
	let resultKind = $state<'nat20' | 'nat1' | 'normal'>('normal');
	let error = $state('');
	let resultTimer: ReturnType<typeof setTimeout> | null = null;

	function clearResultTimer(): void {
		if (resultTimer === null) return;
		clearTimeout(resultTimer);
		resultTimer = null;
	}

	function detectResultKind(): 'nat20' | 'nat1' | 'normal' {
		const last = diceState.lastRoll;
		if (!last) return 'normal';
		const d20 = last.rolls.find((detail) => detail.notation.toLowerCase().includes('d20'));
		if (!d20 || d20.kept.length !== 1) return 'normal';
		if (d20.kept[0] === 20) return 'nat20';
		if (d20.kept[0] === 1) return 'nat1';
		return 'normal';
	}

	function rollInline(): void {
		const attempt = diceState.roll(expression, 'editor');
		if (!attempt.ok) {
			error = attempt.error;
			return;
		}
		error = '';
		resultText = attempt.entry.totalText;
		resultKind = detectResultKind();
		showingResult = true;
		clearResultTimer();
		resultTimer = setTimeout(() => {
			showingResult = false;
			resultTimer = null;
		}, 1800);
	}

	onDestroy(() => {
		clearResultTimer();
	});
</script>

<span class="roll-button">
	{#if showingResult}
		<span class="roll-button__result dice-result-chip" data-result-kind={resultKind}
			>{resultText}</span
		>
	{:else}
		<button type="button" class="roll-button__trigger" onclick={rollInline}>{expression}</button>
	{/if}
</span>

{#if error}
	<span class="roll-button__error" role="status">{error}</span>
{/if}
