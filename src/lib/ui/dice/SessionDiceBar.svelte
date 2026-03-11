<script lang="ts">
	import {
		diceState,
		type DiceRollHistoryEntry,
		type DiceRollSource,
	} from '$lib/state/dice.svelte.js';

	interface Props {
		compact?: boolean;
		source?: DiceRollSource;
		oncustom?: () => void;
	}

	interface SessionDie {
		label: string;
		expression: string;
		iconPath: string;
	}

	let { compact = false, source = 'tray', oncustom }: Props = $props();
	let lastRollEntry = $state<DiceRollHistoryEntry | null>(null);
	let error = $state('');

	const SESSION_DICE: SessionDie[] = [
		{ label: 'd4', expression: '1d4', iconPath: '/icons/dice/d4.svg' },
		{ label: 'd6', expression: '1d6', iconPath: '/icons/dice/d6.svg' },
		{ label: 'd8', expression: '1d8', iconPath: '/icons/dice/d8.svg' },
		{ label: 'd10', expression: '1d10', iconPath: '/icons/dice/d10.svg' },
		{ label: 'd12', expression: '1d12', iconPath: '/icons/dice/d12.svg' },
		{ label: 'd20', expression: '1d20', iconPath: '/icons/dice/d20.svg' },
		{ label: 'd100', expression: '1d100', iconPath: '/icons/dice/d100.svg' },
	];

	function rollKindForEntry(entry: DiceRollHistoryEntry | null): 'nat20' | 'nat1' | 'normal' {
		if (!entry) return 'normal';
		const d20 = entry.rolls.find((detail) => detail.notation.toLowerCase().includes('d20'));
		if (!d20 || d20.kept.length !== 1) return 'normal';
		if (d20.kept[0] === 20) return 'nat20';
		if (d20.kept[0] === 1) return 'nat1';
		return 'normal';
	}

	function rollSessionDie(expression: string): void {
		const attempt = diceState.roll(expression, source);
		if (!attempt.ok) {
			error = attempt.error;
			return;
		}
		lastRollEntry = attempt.entry;
		error = '';
	}
</script>

<section
	class="rounded-md border border-border bg-surface p-2 {compact ? 'space-y-1.5' : 'space-y-2'}"
	aria-label="Session dice bar"
>
	<div class="flex items-center justify-between gap-2">
		<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Session Dice</p>
		<button
			type="button"
			class="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt hover:text-ink"
			onclick={() => oncustom?.()}
		>
			Custom
		</button>
	</div>

	<div class="grid grid-cols-7 gap-1">
		{#each SESSION_DICE as die (die.label)}
			<button
				type="button"
				class="session-die-button rounded-md border border-border bg-surface-alt/60 px-1 py-1 text-2xs font-semibold text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:border-accent/50 hover:bg-accent-subtle/45 hover:text-ink"
				onclick={() => rollSessionDie(die.expression)}
				aria-label={`Roll ${die.label}`}
			>
				<img src={die.iconPath} alt="" class="mx-auto h-4 w-4" />
				<span class="mt-0.5 block text-2xs leading-none">{die.label}</span>
			</button>
		{/each}
	</div>

	{#if lastRollEntry}
		<div class="rounded-md border border-border/70 bg-surface-alt/50 px-2 py-1.5 text-xs text-ink">
			<div class="flex items-center justify-between gap-2">
				<span class="truncate">{lastRollEntry.expression}</span>
				<span class="dice-result-chip" data-result-kind={rollKindForEntry(lastRollEntry)}
					>{lastRollEntry.totalText}</span
				>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="text-xs text-error">{error}</p>
	{/if}
</section>
