<script lang="ts">
	import { onMount } from 'svelte';
	import { diceState, type DiceRollSource } from '$lib/state/dice.svelte.js';

	interface Props {
		compact?: boolean;
		showHeader?: boolean;
		source?: DiceRollSource;
	}

	let { compact = false, showHeader = true, source = 'tray' }: Props = $props();
	let expression = $state('1d20+5');
	let error = $state('');
	let savingMacro = $state(false);
	let macroError = $state('');
	let macroEditId = $state<string | null>(null);
	let macroLabel = $state('');
	let macroExpression = $state('1d20+5');
	let macroEditorOpen = $state(false);

	let macros = $derived(diceState.macros);
	let quickMacros = $derived(diceState.quickMacros);
	let lastRoll = $derived(diceState.lastRoll);
	let history = $derived.by(() => diceState.history.slice(0, compact ? 25 : 120));

	onMount(() => {
		void diceState.ensureMacrosLoaded();
		macroEditorOpen = !compact;
	});

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString();
		} catch {
			return iso;
		}
	}

	function rollFromInput(): void {
		const attempt = diceState.roll(expression, source);
		if (!attempt.ok) {
			error = attempt.error;
			return;
		}
		error = '';
	}

	function rollMacro(macro: (typeof macros)[number], rollSource: DiceRollSource = 'macro'): void {
		const attempt = diceState.rollMacro(macro, rollSource);
		if (!attempt.ok) {
			error = attempt.error;
			return;
		}
		error = '';
	}

	function rollKindForEntry(entry: (typeof history)[number] | null): 'nat20' | 'nat1' | 'normal' {
		if (!entry) return 'normal';
		const d20 = entry.rolls.find((detail) => detail.notation.toLowerCase().includes('d20'));
		if (!d20 || d20.kept.length !== 1) return 'normal';
		const kept = d20.kept[0];
		if (kept === 20) return 'nat20';
		if (kept === 1) return 'nat1';
		return 'normal';
	}

	function resetMacroEditor(): void {
		macroEditId = null;
		macroLabel = '';
		macroExpression = '1d20+5';
		macroError = '';
	}

	function editMacro(macro: (typeof macros)[number]): void {
		macroEditorOpen = true;
		macroEditId = macro.id;
		macroLabel = macro.label;
		macroExpression = macro.expression;
		macroError = '';
	}

	async function saveMacro(): Promise<void> {
		savingMacro = true;
		macroError = '';
		try {
			const result = await diceState.saveMacro({
				id: macroEditId ?? undefined,
				label: macroLabel,
				expression: macroExpression,
			});
			if (!result.ok) {
				macroError = result.error;
				return;
			}
			resetMacroEditor();
		} finally {
			savingMacro = false;
		}
	}

	async function deleteMacro(macroId: string): Promise<void> {
		await diceState.deleteMacro(macroId);
		if (macroEditId === macroId) {
			resetMacroEditor();
		}
	}
</script>

<div class="h-full min-h-0 flex flex-col gap-2 p-2.5">
	{#if showHeader}
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-semibold text-ink">Dice Tray</h3>
			<button
				type="button"
				class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt transition-colors disabled:opacity-50"
				onclick={() => diceState.clearHistory()}
				disabled={history.length === 0}
			>
				Clear History
			</button>
		</div>
	{/if}

	<div class="flex items-center gap-2">
		<input
			type="text"
			bind:value={expression}
			placeholder="1d20+5, 4d6kh3, adv, dis"
			class="h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm text-ink"
			aria-label="Dice expression"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					rollFromInput();
				}
			}}
		/>
		<button
			type="button"
			class="h-8 rounded bg-accent hover:bg-accent-hover px-3 text-xs font-semibold text-white transition-colors"
			onclick={rollFromInput}
		>
			Roll
		</button>
	</div>

	{#if error}
		<p class="text-xs text-error">{error}</p>
	{/if}

	{#if quickMacros.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each quickMacros as macro (macro.id)}
				<button
					type="button"
					class="rounded border border-border/70 bg-surface-alt/70 px-2 py-1 text-xs text-ink hover:bg-surface transition-colors"
					title={macro.expression}
					onclick={() => rollMacro(macro)}
				>
					{macro.label}
				</button>
			{/each}
		</div>
	{/if}

	<div class="rounded border border-border/70 bg-surface-alt/45 p-2">
		{#if lastRoll}
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="text-xs text-ink-muted truncate">
						{lastRoll.expression}
					</p>
					<p class="text-lg font-bold text-ink">
						=
						<span class="dice-result-chip" data-result-kind={rollKindForEntry(lastRoll)}>
							{lastRoll.totalText}
						</span>
					</p>
					<p class="text-xs text-ink-faint">{lastRoll.breakdown}</p>
				</div>
				<p class="text-xs text-ink-faint">{formatTime(lastRoll.at)}</p>
			</div>
			<div class="mt-2 space-y-1">
				{#each lastRoll.rolls as detail, detailIndex (`${detail.notation}-${detailIndex}`)}
					<div class="text-xs text-ink-muted">
						<span class="font-semibold text-ink">{detail.notation}</span>
						<span class="ml-1">
							{#each detail.rolls as value, index (`${detail.notation}-${detailIndex}-${index}`)}
								<span
									class="inline-block mr-1 rounded border px-1 py-0.5 font-mono {detail.keptIndices.includes(
										index,
									)
										? 'border-accent/40 text-ink'
										: 'border-border/50 text-ink-faint line-through'}"
								>
									{value}
								</span>
							{/each}
							<span class="ml-1">=> {detail.subtotal}</span>
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-xs text-ink-faint">No rolls yet for this session.</p>
		{/if}
	</div>

	<div class="min-h-0 flex-1 rounded border border-border/60 bg-surface/70 p-2 overflow-y-auto">
		{#if history.length === 0}
			<p class="text-xs text-ink-faint">Roll history is empty.</p>
		{:else}
			<ul class="space-y-1">
				{#each history as entry (entry.id)}
					<li class="rounded border border-border/50 bg-surface px-2 py-1.5">
						<div class="flex items-center justify-between gap-2 text-xs">
							<span class="truncate text-ink">{entry.expression}</span>
							<span
								class="font-mono text-ink dice-result-chip"
								data-result-kind={rollKindForEntry(entry)}>{entry.totalText}</span
							>
						</div>
						<div class="flex items-center justify-between gap-2 text-2xs text-ink-faint mt-0.5">
							<span
								>{entry.macroLabel ? `${entry.macroLabel} (${entry.source})` : entry.source}</span
							>
							<span>{formatTime(entry.at)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if !compact}
		<div class="rounded border border-border bg-surface p-2">
			<div class="flex items-center justify-between gap-2">
				<h4 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">Roll Macros</h4>
				<button
					type="button"
					class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt transition-colors"
					onclick={() => (macroEditorOpen = !macroEditorOpen)}
				>
					{macroEditorOpen ? 'Hide' : 'Edit'}
				</button>
			</div>

			{#if macroEditorOpen}
				<div class="mt-2 space-y-2">
					<div class="grid gap-2 md:grid-cols-2">
						<label class="text-xs text-ink-muted">
							Label
							<input
								type="text"
								bind:value={macroLabel}
								class="mt-1 h-8 w-full rounded border border-border bg-surface-alt px-2 text-sm text-ink"
								placeholder="Sneak Attack"
							/>
						</label>
						<label class="text-xs text-ink-muted">
							Expression
							<input
								type="text"
								bind:value={macroExpression}
								class="mt-1 h-8 w-full rounded border border-border bg-surface-alt px-2 text-sm text-ink"
								placeholder="1d20+7"
							/>
						</label>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="rounded bg-accent hover:bg-accent-hover px-2.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
							onclick={() => void saveMacro()}
							disabled={savingMacro}
						>
							{savingMacro ? 'Saving...' : macroEditId ? 'Update Macro' : 'Save Macro'}
						</button>
						{#if macroEditId}
							<button
								type="button"
								class="rounded border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-alt transition-colors"
								onclick={resetMacroEditor}
							>
								Cancel Edit
							</button>
						{/if}
					</div>
					{#if macroError}
						<p class="text-xs text-error">{macroError}</p>
					{/if}
				</div>
			{/if}

			{#if macros.length === 0}
				<p class="mt-2 text-xs text-ink-faint">No macros saved yet.</p>
			{:else}
				<ul class="mt-2 space-y-1 max-h-36 overflow-y-auto pr-1">
					{#each macros as macro (macro.id)}
						<li class="rounded border border-border/60 px-2 py-1.5 bg-surface-alt/40">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs font-medium text-ink truncate">
										{macro.label}
									</p>
									<p class="text-xs text-ink-faint truncate">
										{macro.expression}
									</p>
								</div>
								<div class="flex items-center gap-1">
									<button
										type="button"
										class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface transition-colors"
										onclick={() => rollMacro(macro, 'macro')}
									>
										Roll
									</button>
									<button
										type="button"
										class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface transition-colors"
										onclick={() => editMacro(macro)}
									>
										Edit
									</button>
									<button
										type="button"
										class="rounded border border-error/40 px-2 py-1 text-xs text-error hover:bg-error/5 transition-colors"
										onclick={() => void deleteMacro(macro.id)}
									>
										Delete
									</button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
