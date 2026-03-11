<script lang="ts">
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import type { SessionRollHistoryEntry } from '$lib/types/session-state.js';

	interface Props {
		maxItems?: number;
	}

	let { maxItems = 120 }: Props = $props();
	let editingEntryId = $state<string | null>(null);
	let labelDraft = $state('');
	let expandedEntryId = $state<string | null>(null);

	const history = $derived.by(() => sessionModeState.rollHistory.slice(0, Math.max(1, maxItems)));

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso;
		}
	}

	function toggleExpanded(entryId: string): void {
		expandedEntryId = expandedEntryId === entryId ? null : entryId;
	}

	function beginRename(entry: SessionRollHistoryEntry): void {
		editingEntryId = entry.id;
		labelDraft = entry.label ?? '';
	}

	async function saveLabel(entryId: string): Promise<void> {
		await sessionModeState.renameRollEntry(entryId, labelDraft);
		editingEntryId = null;
	}
</script>

<section class="rounded-md border border-border bg-surface p-2.5">
	<div class="mb-2 flex items-center justify-between gap-2">
		<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Session Roll History</p>
		<span class="rounded-full bg-surface-alt px-2 py-0.5 text-2xs text-ink-faint"
			>{history.length}</span
		>
	</div>

	<div class="max-h-[26rem] space-y-1.5 overflow-y-auto pr-0.5">
		{#if history.length === 0}
			<p
				class="rounded-md border border-border/60 bg-surface-alt/35 px-2 py-1.5 text-xs text-ink-faint"
			>
				No rolls recorded in this session yet.
			</p>
		{:else}
			{#each history as entry (entry.id)}
				<div class="group rounded-md border border-border/70 bg-surface-alt/35 px-2 py-1.5">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							{#if editingEntryId === entry.id}
								<input
									type="text"
									bind:value={labelDraft}
									class="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-ink"
									placeholder="Roll label"
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											void saveLabel(entry.id);
										}
										if (event.key === 'Escape') {
											editingEntryId = null;
										}
									}}
									onblur={() => void saveLabel(entry.id)}
								/>
							{:else}
								<button
									type="button"
									class="max-w-full truncate text-left text-xs font-medium text-ink hover:underline"
									onclick={() => beginRename(entry)}
									aria-label="Rename roll"
								>
									{entry.label ?? entry.expression}
								</button>
							{/if}
							<p class="truncate text-2xs text-ink-faint">{entry.expression}</p>
						</div>
						<div class="text-right">
							<span
								class="dice-result-chip text-xs"
								data-result-kind={entry.naturalResult ?? 'normal'}>{entry.result}</span
							>
							<p class="mt-0.5 text-2xs text-ink-faint">{formatTime(entry.at)}</p>
						</div>
					</div>

					{#if entry.breakdown}
						<p class="mt-1 truncate text-2xs text-ink-faint">{entry.breakdown}</p>
					{/if}

					{#if entry.rolls.length > 0}
						<div
							class="mt-1.5 hidden space-y-1 group-hover:block group-focus-within:block {expandedEntryId ===
							entry.id
								? 'block'
								: ''}"
						>
							{#each entry.rolls as detail, detailIndex (`${entry.id}-${detail.notation}-${detailIndex}`)}
								<div class="text-2xs text-ink-muted">
									<span class="font-semibold text-ink">{detail.notation}</span>
									<span class="ml-1">
										{#each detail.rolls as value, rollIndex (`${entry.id}-${detailIndex}-${rollIndex}`)}
											<span
												class="mr-1 inline-block rounded border px-1 py-0.5 font-mono {detail.keptIndices.includes(
													rollIndex,
												)
													? 'border-accent/45 text-ink'
													: 'border-border/50 text-ink-faint line-through'}"
											>
												{value}
											</span>
										{/each}
									</span>
								</div>
							{/each}
						</div>
						<button
							type="button"
							class="mt-1 text-2xs text-ink-faint hover:text-ink"
							onclick={() => toggleExpanded(entry.id)}
						>
							{expandedEntryId === entry.id ? 'Hide dice' : 'Show dice'}
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</section>
