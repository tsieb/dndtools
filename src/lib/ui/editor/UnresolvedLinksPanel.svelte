<script lang="ts">
	import type {
		AmbiguousLinkEntry,
		UnresolvedLinkEntry,
		LinkCandidateSuggestion,
	} from '$lib/domain/unresolved-links.js';

	interface Props {
		unresolved: UnresolvedLinkEntry[];
		ambiguous: AmbiguousLinkEntry[];
		oncreateone: (title: string) => void;
		oncreateall: () => void;
		onrename: (from: string, to: string) => void;
		ondisambiguate: (from: string, targetId: string, displayTitle: string) => void;
	}

	let { unresolved, ambiguous, oncreateone, oncreateall, onrename, ondisambiguate }: Props =
		$props();
	let renameTo = $state<Record<string, string>>({});
	let selectionByKey = $state<Record<string, string>>({});

	function getRename(title: string): string {
		return renameTo[title] ?? '';
	}

	function makeOptionValue(candidate: LinkCandidateSuggestion): string {
		return `${candidate.noteId}|${candidate.title}`;
	}

	function parseOptionValue(value: string): { targetId: string; displayTitle: string } | null {
		const [targetId, ...titleParts] = value.split('|');
		const displayTitle = titleParts.join('|').trim();
		if (!targetId?.trim()) return null;
		return {
			targetId: targetId.trim(),
			displayTitle: displayTitle || 'Linked Note',
		};
	}

	function applySelectedDisambiguation(title: string, key: string): void {
		const selected = selectionByKey[key];
		if (!selected) return;
		const parsed = parseOptionValue(selected);
		if (!parsed) return;
		ondisambiguate(title, parsed.targetId, parsed.displayTitle);
	}
</script>

{#if unresolved.length > 0 || ambiguous.length > 0}
	<section
		class="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 dark:border-tavern-warning/40 dark:bg-tavern-warning/10"
	>
		<div class="mb-2 flex items-center justify-between gap-2">
			<h2
				class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
			>
				Link Issues
			</h2>
			{#if unresolved.some((entry) => entry.targetKind === 'title')}
				<button
					type="button"
					class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
					onclick={oncreateall}
				>
					Batch Create Missing Notes
				</button>
			{/if}
		</div>

		{#if ambiguous.length > 0}
			<div class="mb-3">
				<p class="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">Ambiguous Links</p>
				<ul class="space-y-2">
					{#each ambiguous as entry (entry.title)}
						{@const key = `ambiguous:${entry.title}`}
						<li
							class="rounded border border-amber-300/70 bg-amber-50/80 p-2 dark:border-amber-800/60 dark:bg-amber-900/10"
						>
							<div class="mb-1 flex items-center justify-between gap-2">
								<p class="text-sm font-medium text-ink dark:text-tavern-text">
									[[{entry.title}]]
									<span class="ml-1 text-xs text-ink-faint dark:text-tavern-faint"
										>x{entry.count}</span
									>
								</p>
								<span class="text-xs text-amber-700 dark:text-amber-400">Needs disambiguation</span>
							</div>
							<div class="flex gap-1">
								<select
									value={selectionByKey[key] ?? ''}
									onchange={(event) => {
										selectionByKey = {
											...selectionByKey,
											[key]: event.currentTarget.value,
										};
									}}
									class="w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
								>
									<option value="">Choose target note</option>
									{#each entry.candidates as candidate (candidate.noteId)}
										<option value={makeOptionValue(candidate)}>
											{candidate.title} · {candidate.folder}
											{candidate.matchedBy === 'alias' && candidate.matchedAlias
												? ` · alias: ${candidate.matchedAlias}`
												: ''}
										</option>
									{/each}
								</select>
								<button
									type="button"
									class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
									onclick={() => applySelectedDisambiguation(entry.title, key)}
								>
									Link
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if unresolved.length > 0}
			<div>
				<p class="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">Unresolved Links</p>
				<ul class="space-y-2">
					{#each unresolved as entry (entry.targetKind + ':' + (entry.targetIdHint ?? entry.title))}
						{@const key = `unresolved:${entry.targetKind}:${entry.targetIdHint ?? entry.title}`}
						<li
							class="rounded border border-border dark:border-tavern-border bg-surface/80 dark:bg-tavern-surface/80 p-2"
						>
							<div class="mb-1 flex items-center justify-between gap-2">
								<p class="text-sm font-medium text-ink dark:text-tavern-text">
									[[{entry.title}]]
									<span class="ml-1 text-xs text-ink-faint dark:text-tavern-faint"
										>x{entry.count}</span
									>
								</p>
								{#if entry.targetKind === 'title'}
									<button
										type="button"
										class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
										onclick={() => oncreateone(entry.title)}
									>
										Create
									</button>
								{:else}
									<span class="text-xs text-ink-faint dark:text-tavern-faint"
										>Missing ID link: {entry.targetIdHint}</span
									>
								{/if}
							</div>

							{#if entry.targetKind === 'title'}
								<div class="grid gap-2 md:grid-cols-2">
									<label class="text-xs text-ink-muted dark:text-tavern-muted">
										Quick Rename
										<div class="mt-1 flex gap-1">
											<input
												type="text"
												value={getRename(entry.title)}
												oninput={(event) => {
													renameTo = { ...renameTo, [entry.title]: event.currentTarget.value };
												}}
												class="w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
											/>
											<button
												type="button"
												class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
												onclick={() => onrename(entry.title, getRename(entry.title))}
											>
												Apply
											</button>
										</div>
									</label>

									<label class="text-xs text-ink-muted dark:text-tavern-muted">
										Resolve to Existing Note
										<div class="mt-1 flex gap-1">
											<select
												value={selectionByKey[key] ?? ''}
												onchange={(event) => {
													selectionByKey = {
														...selectionByKey,
														[key]: event.currentTarget.value,
													};
												}}
												class="w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
											>
												<option value="">Choose existing note</option>
												{#each entry.suggestions as suggestion (suggestion.noteId)}
													<option value={makeOptionValue(suggestion)}>
														{suggestion.title} · {suggestion.folder}
														{suggestion.matchedBy === 'alias' && suggestion.matchedAlias
															? ` · alias: ${suggestion.matchedAlias}`
															: ''}
													</option>
												{/each}
											</select>
											<button
												type="button"
												class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
												onclick={() => applySelectedDisambiguation(entry.title, key)}
											>
												Link
											</button>
										</div>
									</label>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}
