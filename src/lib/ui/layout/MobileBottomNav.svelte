<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';

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

	let navItems = $derived.by<NavItem[]>(() => [
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
		{
			id: 'graph',
			label: 'Graph',
			href: playerModeState.enabled ? resolve('/player') : resolve('/knowledge/graph'),
			match: (pathname) => pathname.startsWith('/knowledge/graph'),
		},
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
	]);
</script>

<div
	class="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[calc(0.3rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur-md dark:border-tavern-border dark:bg-tavern-surface/95"
	data-testid="mobile-bottom-nav"
>
	<div class="mx-auto mb-1 flex w-full max-w-[560px] justify-end px-3">
		<button
			type="button"
			class="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink-muted dark:border-tavern-border dark:text-tavern-muted"
			onclick={onopenlibrary}
			aria-label="Open library sheet"
		>
			Library
		</button>
	</div>
	<nav
		class="mx-auto grid w-full max-w-[560px] grid-cols-5 gap-1 px-2"
		aria-label="Global navigation: Mobile primary sections"
	>
		{#each navItems as item (item.id)}
			<a
				href={item.href}
				class="flex min-h-12 flex-col items-center justify-center rounded-md px-1 py-1 text-[11px] font-medium transition-colors {item.match(
					currentPath,
				)
					? 'bg-accent-subtle text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
					: 'text-ink-muted dark:text-tavern-muted'}"
				aria-current={item.match(currentPath) ? 'page' : undefined}
			>
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>
</div>
