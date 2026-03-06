<script lang="ts">
	import { resolve } from '$app/paths';
	import { ui } from '$lib/state/ui.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';

	interface Props {
		onsearch: () => void;
	}

	let { onsearch }: Props = $props();

	const desktopBridgeAvailable = $derived(
		typeof window !== 'undefined' && typeof window.dndtoolsDesktop !== 'undefined',
	);

	const routeTitle = $derived.by(() => {
		const [pathname = '/knowledge', query = ''] = navigationState.activeRoute.split('?');
		const searchParams = new URLSearchParams(query);
		if (pathname === '/knowledge') return 'Knowledge';
		if (pathname === '/knowledge/notes') {
			const tag = searchParams.get('tag');
			const folder = searchParams.get('folder');
			if (tag) return `Notes #${tag}`;
			if (folder) return `Notes ${folder}`;
			return 'All Notes';
		}
		if (pathname === '/knowledge/search') return 'Search';
		if (pathname === '/knowledge/graph') return 'Graph';
		if (pathname === '/atlas/maps') return 'Maps';
		if (pathname === '/campaign/timeline') return 'Timeline';
		if (pathname === '/session/boards') return 'Session Board';
		if (pathname === '/session/encounter/new') return 'Encounter Builder';
		if (pathname === '/session/combat') return 'Combat Tracker';
		if (pathname === '/settings') return 'Settings';
		if (pathname === '/player') return 'Player Screen';
		return navigationState.currentEntry?.label ?? pathname;
	});
</script>

<header
	class="h-[52px] shrink-0 border-b border-border bg-surface/88 px-3 backdrop-blur-md dark:border-tavern-border dark:bg-tavern-surface/88 {desktopBridgeAvailable
		? 'desktop-drag'
		: ''}"
>
	<div class="flex h-full items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-1.5">
			<button
				class="desktop-no-drag rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => ui.toggleSidebar()}
				aria-label="Toggle local navigation"
				title="Toggle local navigation (Ctrl+B)"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<button
				class="desktop-no-drag rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => window.history.back()}
				disabled={!navigationState.canGoBack}
				aria-label="Go back"
				title={navigationState.canGoBack && navigationState.backEntry
					? `Back to ${navigationState.backEntry.label}`
					: 'No previous location'}
			>
				<svg
					class="h-4.5 w-4.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<button
				class="desktop-no-drag rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => window.history.forward()}
				disabled={!navigationState.canGoForward}
				aria-label="Go forward"
				title={navigationState.canGoForward && navigationState.forwardEntry
					? `Forward to ${navigationState.forwardEntry.label}`
					: 'No forward location'}
			>
				<svg
					class="h-4.5 w-4.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</button>
			<div class="ml-1 min-w-0">
				<p class="truncate text-sm font-semibold text-ink dark:text-tavern-text">{routeTitle}</p>
			</div>
		</div>

		<div class="desktop-no-drag ml-2 flex items-center gap-1.5">
			<button
				class="flex items-center gap-2 rounded-md bg-surface-alt px-2.5 py-1.5 text-sm text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-border dark:bg-tavern-surface-alt dark:text-tavern-faint dark:hover:bg-tavern-border"
				onclick={onsearch}
				aria-label="Open command palette"
				title="Open command palette (Ctrl+P)"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<span class="hidden sm:inline">Command</span>
			</button>

			{#if vaultHealthState.severity !== 'none'}
				<a
					href={`${resolve('/settings')}?tab=vault`}
					class="relative rounded-md p-1.5 transition-[transform,colors] active:scale-[0.97] active:brightness-95 {vaultHealthState.severity ===
					'critical'
						? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
						: vaultHealthState.severity === 'warning'
							? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
							: 'text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
					aria-label="Vault integrity issues detected"
					title="Open vault health report"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						/>
					</svg>
					<span
						class="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 text-white {vaultHealthState.severity ===
						'critical'
							? 'bg-red-600'
							: vaultHealthState.severity === 'warning'
								? 'bg-amber-500'
								: 'bg-ink-muted dark:bg-tavern-muted'}"
					>
						{vaultHealthState.issueCount}
					</span>
				</a>
			{/if}

			<a
				href={`${resolve('/settings')}?tab=mcp#mcp-changes`}
				class="relative rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				aria-label="Pending MCP changes"
				title="Review pending MCP changes"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
					/>
				</svg>
				{#if mcpChangesState.count > 0}
					<span
						class="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 text-white dark:bg-tavern-warning"
					>
						{mcpChangesState.count}
					</span>
				{/if}
			</a>
		</div>
	</div>
</header>
