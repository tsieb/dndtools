<script lang="ts">
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';
	import {
		KEYBOARD_SHORTCUT_REGISTRY,
		KEYBOARD_SHORTCUT_SECTION_ORDER,
	} from '$lib/domain/keyboard-shortcuts.js';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();
	let query = $state('');

	const normalizedQuery = $derived(query.trim().toLowerCase());

	const filteredShortcuts = $derived.by(() =>
		KEYBOARD_SHORTCUT_REGISTRY.filter((entry) => {
			if (!normalizedQuery) return true;
			const haystack =
				`${entry.label} ${entry.shortcut} ${entry.keywords} ${entry.section}`.toLowerCase();
			return haystack.includes(normalizedQuery);
		}),
	);

	const groupedShortcuts = $derived.by(() => {
		return KEYBOARD_SHORTCUT_SECTION_ORDER.map((section) => ({
			section,
			items: filteredShortcuts.filter((entry) => entry.section === section),
		})).filter((group) => group.items.length > 0);
	});

	function closeOverlay(): void {
		onclose();
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		closeOverlay();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		closeOverlay();
	}

	function splitShortcut(shortcut: string): string[] {
		return shortcut
			.split('+')
			.map((token) => token.trim())
			.filter((token) => token.length > 0);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcut overlay"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg"
			use:focusTrap
		>
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 class="text-base font-semibold text-ink">Keyboard shortcuts</h2>
				<button
					type="button"
					class="rounded-md px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					onclick={closeOverlay}
					aria-label="Close keyboard shortcuts overlay"
				>
					Close
				</button>
			</div>
			<div class="border-b border-border px-4 py-3">
				<label class="sr-only" for="shortcut-search">Search shortcuts</label>
				<input
					id="shortcut-search"
					type="search"
					placeholder="Search shortcuts"
					bind:value={query}
					class="w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-ink outline-none ring-offset-2 placeholder:text-ink-faint focus:ring-2 focus:ring-accent/35"
				/>
			</div>
			<div class="max-h-[62vh] overflow-y-auto px-4 py-2">
				{#if groupedShortcuts.length === 0}
					<div class="py-8 text-center text-sm text-ink-muted">No shortcuts match your search.</div>
				{:else}
					{#each groupedShortcuts as group (group.section)}
						<section class="py-2">
							<h3 class="pb-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
								{group.section}
							</h3>
							<ul class="divide-y divide-border rounded-md border border-border">
								{#each group.items as item (item.id)}
									<li class="flex items-center justify-between gap-3 px-3 py-2.5">
										<span class="text-sm text-ink">{item.label}</span>
										<span class="flex items-center gap-1">
											{#each splitShortcut(item.shortcut) as key, index (`${item.id}-${key}-${index}`)}
												{#if index > 0}
													<span class="text-xs text-ink-faint">+</span>
												{/if}
												<kbd
													class="rounded border border-border bg-surface-alt px-2 py-0.5 font-mono text-xs text-ink"
												>
													{key}
												</kbd>
											{/each}
										</span>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
