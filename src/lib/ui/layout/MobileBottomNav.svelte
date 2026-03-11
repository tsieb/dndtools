<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';

	interface Props {
		onopenlibrary: () => void;
	}

	type NavItem = {
		id: 'notes' | 'search' | 'graph' | 'session' | 'settings';
		label: string;
		href: string;
		match: (pathname: string) => boolean;
	};

	let { onopenlibrary }: Props = $props();
	let currentPath = $derived(page.url.pathname);
	let revealGraphLink = $derived(
		vaultMaturityState.disclosure.revealKnowledgeGraphLink ||
			featureSettingsState.isAdvancedEnabled('knowledge_graph'),
	);
	let promoteSessionSection = $derived(vaultMaturityState.disclosure.promoteSessionSection);
	let sessionCountBadge = $derived.by(() => {
		const count = vaultMaturityState.signals.sessionCount;
		if (count <= 0) return '';
		return count > 9 ? '9+' : String(count);
	});
	let navGridClass = $derived.by(() =>
		navItems.length >= 5
			? 'mx-auto grid w-full max-w-[560px] grid-cols-5 gap-1 px-2'
			: 'mx-auto grid w-full max-w-[560px] grid-cols-4 gap-1 px-2',
	);

	let navItems = $derived.by<NavItem[]>(() => {
		const items: NavItem[] = [
			{
				id: 'notes',
				label: 'Notes',
				href: resolve('/knowledge'),
				match: (pathname) => pathname.startsWith('/knowledge'),
			},
			{
				id: 'search',
				label: 'Search',
				href: resolve('/knowledge/search'),
				match: (pathname) => pathname.startsWith('/knowledge/search'),
			},
		];
		if (revealGraphLink) {
			items.push({
				id: 'graph',
				label: 'Graph',
				href: playerModeState.enabled ? resolve('/player') : resolve('/knowledge/graph'),
				match: (pathname) => pathname.startsWith('/knowledge/graph'),
			});
		}
		items.push(
			{
				id: 'session',
				label: 'Session',
				href: playerModeState.enabled ? resolve('/player') : resolve('/session/boards'),
				match: (pathname) =>
					pathname.startsWith('/session/boards') ||
					pathname.startsWith('/session/combat') ||
					pathname.startsWith('/session/encounter'),
			},
			{
				id: 'settings',
				label: 'Settings',
				href: resolve('/settings'),
				match: (pathname) => pathname.startsWith('/settings'),
			},
		);
		return items;
	});
</script>

<div
	class="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[calc(0.3rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur-md"
	data-testid="mobile-bottom-nav"
>
	<div class="mx-auto mb-1 flex w-full max-w-[560px] justify-end px-3">
		<button
			type="button"
			class="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink-muted"
			onclick={onopenlibrary}
			aria-label="Open library sheet"
		>
			Library
		</button>
	</div>
	<nav class={navGridClass} role="navigation" aria-label="Primary">
		{#each navItems as item (item.id)}
			<a
				href={item.href}
				class="flex min-h-12 flex-col items-center justify-center rounded-md px-1 py-1 text-xs font-medium transition-colors {item.match(
					currentPath,
				)
					? 'bg-accent-subtle text-accent'
					: 'text-ink-muted'}"
				aria-current={item.match(currentPath) ? 'page' : undefined}
			>
				<span class="relative inline-flex items-center justify-center">
					{item.label}
					{#if item.id === 'session' && promoteSessionSection && sessionCountBadge}
						<span
							class="absolute -right-4 -top-1 min-w-4 rounded-full border border-surface bg-accent px-1 text-center text-2xs font-semibold leading-4 text-white"
						>
							{sessionCountBadge}
						</span>
					{/if}
				</span>
			</a>
		{/each}
	</nav>
</div>
