<script lang="ts">
	export interface BreadcrumbLink {
		label: string;
		href: string | null;
	}

	interface Props {
		items: BreadcrumbLink[];
		className?: string;
		collapseAfter?: number;
	}

	let { items, className = '', collapseAfter = 4 }: Props = $props();
	let isNarrowViewport = $state(false);

	const normalizedItems = $derived.by(() =>
		items
			.map((entry) => ({ label: entry.label.trim(), href: entry.href }))
			.filter((entry) => entry.label.length > 0),
	);
	const shouldCollapse = $derived(
		isNarrowViewport && normalizedItems.length > collapseAfter && normalizedItems.length > 2,
	);
	const firstItem = $derived(normalizedItems[0] ?? null);
	const middleItems = $derived.by(() => {
		if (!shouldCollapse) return [];
		return normalizedItems.slice(1, -1);
	});
	const lastItem = $derived(
		normalizedItems.length > 0 ? normalizedItems[normalizedItems.length - 1] : null,
	);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		const applyViewport = (): void => {
			isNarrowViewport = mediaQuery.matches;
		};
		applyViewport();
		mediaQuery.addEventListener('change', applyViewport);
		return () => mediaQuery.removeEventListener('change', applyViewport);
	});

	function itemKey(item: BreadcrumbLink, index: number): string {
		return `${item.label}-${item.href ?? 'current'}-${index}`;
	}
</script>

<nav aria-label="Contextual navigation: Breadcrumb" class={className}>
	<ol class="flex min-w-0 flex-wrap items-center gap-1 text-xs">
		{#if !shouldCollapse}
			{#each normalizedItems as item, index (itemKey(item, index))}
				<li class="inline-flex min-w-0 items-center gap-1">
					{#if index > 0}
						<span class="text-ink-faint" aria-hidden="true">/</span>
					{/if}
					{#if index === normalizedItems.length - 1 || !item.href}
						<span class="truncate rounded px-1 font-medium text-ink" aria-current="page">
							{item.label}
						</span>
					{:else}
						<a
							href={item.href}
							class="truncate rounded px-1 text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
						>
							{item.label}
						</a>
					{/if}
				</li>
			{/each}
		{:else if firstItem && lastItem}
			<li class="inline-flex min-w-0 items-center">
				{#if firstItem.href}
					<a
						href={firstItem.href}
						class="truncate rounded px-1 text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
					>
						{firstItem.label}
					</a>
				{:else}
					<span class="truncate rounded px-1 text-ink-muted">
						{firstItem.label}
					</span>
				{/if}
			</li>
			<li class="inline-flex min-w-0 items-center gap-1">
				<span class="text-ink-faint" aria-hidden="true">/</span>
				<details class="group relative">
					<summary
						class="list-none cursor-pointer rounded px-1 text-ink-muted hover:bg-surface-alt hover:text-ink"
						aria-label="Show full breadcrumb path"
					>
						...
					</summary>
					<div
						class="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-lg"
					>
						<ol class="space-y-0.5">
							{#each middleItems as item, index (itemKey(item, index))}
								<li>
									{#if item.href}
										<a
											href={item.href}
											class="block truncate rounded px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
										>
											{item.label}
										</a>
									{:else}
										<span class="block truncate rounded px-2 py-1 text-xs font-medium text-ink">
											{item.label}
										</span>
									{/if}
								</li>
							{/each}
						</ol>
					</div>
				</details>
			</li>
			<li class="inline-flex min-w-0 items-center gap-1">
				<span class="text-ink-faint" aria-hidden="true">/</span>
				<span class="truncate rounded px-1 font-medium text-ink" aria-current="page">
					{lastItem.label}
				</span>
			</li>
		{/if}
	</ol>
</nav>
