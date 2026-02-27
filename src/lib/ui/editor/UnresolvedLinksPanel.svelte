<script lang="ts">
	import type { UnresolvedLinkEntry } from '$lib/domain/unresolved-links.js';

	interface Props {
		unresolved: UnresolvedLinkEntry[];
		oncreateone: (title: string) => void;
		oncreateall: () => void;
		onrename: (from: string, to: string) => void;
		ondisambiguate: (from: string, to: string) => void;
	}

	let { unresolved, oncreateone, oncreateall, onrename, ondisambiguate }: Props = $props();
	let renameTo = $state<Record<string, string>>({});
	let disambiguateTo = $state<Record<string, string>>({});

	function getRename(title: string): string {
		return renameTo[title] ?? '';
	}

	function getDisambiguate(title: string): string {
		return disambiguateTo[title] ?? '';
	}
</script>

{#if unresolved.length > 0}
	<section
		class="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 dark:border-tavern-warning/40 dark:bg-tavern-warning/10"
	>
		<div class="mb-2 flex items-center justify-between gap-2">
			<h2
				class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
			>
				Unresolved Links
			</h2>
			<button
				type="button"
				class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
				onclick={oncreateall}
			>
				Batch Create
			</button>
		</div>

		<ul class="space-y-2">
			{#each unresolved as entry (entry.title)}
				<li
					class="rounded border border-border dark:border-tavern-border bg-surface/80 dark:bg-tavern-surface/80 p-2"
				>
					<div class="mb-1 flex items-center justify-between gap-2">
						<p class="text-sm font-medium text-ink dark:text-tavern-text">
							[[{entry.title}]]
							<span class="ml-1 text-xs text-ink-faint dark:text-tavern-faint">x{entry.count}</span>
						</p>
						<button
							type="button"
							class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
							onclick={() => oncreateone(entry.title)}
						>
							Create
						</button>
					</div>

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
							Disambiguate
							<div class="mt-1 flex gap-1">
								<select
									value={getDisambiguate(entry.title)}
									onchange={(event) => {
										disambiguateTo = {
											...disambiguateTo,
											[entry.title]: event.currentTarget.value,
										};
									}}
									class="w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
								>
									<option value="">Choose existing note</option>
									{#each entry.suggestions as suggestion (suggestion)}
										<option value={suggestion}>{suggestion}</option>
									{/each}
								</select>
								<button
									type="button"
									class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
									onclick={() => ondisambiguate(entry.title, getDisambiguate(entry.title))}
								>
									Apply
								</button>
							</div>
						</label>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
