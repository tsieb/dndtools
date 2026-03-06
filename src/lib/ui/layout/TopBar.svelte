<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { inputModalityState } from '$lib/state/input-modality.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';

	interface Props {
		onsearch: () => void;
		onsetplayermode: (enabled: boolean) => void;
		ontogglelocalpanel: () => void;
		ontoggledetailpanel: () => void;
		detailpanelavailable: boolean;
		detailpanelopen: boolean;
	}

	let {
		onsearch,
		onsetplayermode,
		ontogglelocalpanel,
		ontoggledetailpanel,
		detailpanelavailable,
		detailpanelopen,
	}: Props = $props();

	let overflowOpen = $state(false);
	let overflowMenuEl = $state<HTMLElement | null>(null);
	let overflowButtonEl = $state<HTMLButtonElement | null>(null);

	const compactEditorMode = $derived.by(() => {
		if (!layoutState.isCompact) return false;
		return /^\/knowledge\/notes\/[^/]+\/edit$/.test(page.url.pathname);
	});

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
	const showKeyboardHints = $derived(!layoutState.isMedium || inputModalityState.keyboardDetected);

	$effect(() => {
		if (layoutState.isCompact) return;
		overflowOpen = false;
	});

	$effect(() => {
		if (!overflowOpen || typeof window === 'undefined') return;
		const handlePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (overflowMenuEl?.contains(target)) return;
			if (overflowButtonEl?.contains(target)) return;
			overflowOpen = false;
		};
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			overflowOpen = false;
			overflowButtonEl?.focus();
		};
		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	function requestCompactEditorBack(): void {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new CustomEvent('dndtools:editor-done-request'));
	}

	function applyTheme(nextTheme: 'light' | 'dark' | 'system'): void {
		void ui.setTheme(nextTheme);
		overflowOpen = false;
	}
</script>

<header
	class="h-[var(--layout-topbar-height)] shrink-0 border-b border-border bg-surface/88 px-3 backdrop-blur-md dark:border-tavern-border dark:bg-tavern-surface/88"
>
	<div class="flex h-full items-center justify-between gap-2">
		{#if layoutState.isCompact}
			<div class="min-w-0 flex flex-1 items-center gap-1.5">
				{#if compactEditorMode}
					<button
						class="rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
						onclick={requestCompactEditorBack}
						aria-label="Done editing"
						title="Done"
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
				{/if}
				<p class="truncate text-sm font-semibold text-ink dark:text-tavern-text">{routeTitle}</p>
			</div>

			<div class="relative ml-2 flex items-center gap-1.5">
				<button
					class="rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
					onclick={onsearch}
					aria-label="Open command palette"
					title="Open command palette (Ctrl+P)"
				>
					<svg
						class="h-4.5 w-4.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</button>
				<button
					bind:this={overflowButtonEl}
					class="rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
					onclick={() => (overflowOpen = !overflowOpen)}
					aria-label="More actions"
					aria-haspopup="menu"
					aria-expanded={overflowOpen}
					title="More actions"
				>
					<svg class="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path
							d="M4 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
						/>
					</svg>
				</button>

				{#if overflowOpen}
					<div
						bind:this={overflowMenuEl}
						class="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-48 rounded-lg border border-border bg-surface p-2 shadow-xl dark:border-tavern-border dark:bg-tavern-surface"
						role="menu"
						aria-label="Compact topbar overflow menu"
					>
						<div class="mb-2 px-1">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-tavern-faint"
							>
								Theme
							</p>
							<div class="mt-1 grid grid-cols-3 gap-1">
								<button
									type="button"
									class="rounded px-1.5 py-1 text-xs {ui.theme === 'light'
										? 'bg-accent-subtle text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
										: 'text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
									onclick={() => applyTheme('light')}
									role="menuitemradio"
									aria-checked={ui.theme === 'light'}
								>
									Light
								</button>
								<button
									type="button"
									class="rounded px-1.5 py-1 text-xs {ui.theme === 'system'
										? 'bg-accent-subtle text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
										: 'text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
									onclick={() => applyTheme('system')}
									role="menuitemradio"
									aria-checked={ui.theme === 'system'}
								>
									Auto
								</button>
								<button
									type="button"
									class="rounded px-1.5 py-1 text-xs {ui.theme === 'dark'
										? 'bg-accent-subtle text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
										: 'text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
									onclick={() => applyTheme('dark')}
									role="menuitemradio"
									aria-checked={ui.theme === 'dark'}
								>
									Dark
								</button>
							</div>
						</div>

						<a
							href={resolve('/settings')}
							class="block rounded px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							role="menuitem"
							onclick={() => (overflowOpen = false)}
						>
							Settings
						</a>
						<button
							type="button"
							class="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							role="menuitem"
							onclick={() => {
								overflowOpen = false;
								onsetplayermode(!playerModeState.enabled);
							}}
						>
							Switch to {playerModeState.enabled ? 'DM' : 'Player'} Mode
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex min-w-0 items-center gap-1.5">
				<button
					class="desktop-no-drag rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
					onclick={ontogglelocalpanel}
					aria-label="Toggle local navigation"
					title={showKeyboardHints ? 'Toggle local navigation (Ctrl+B)' : 'Toggle local navigation'}
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</button>
				{#if layoutState.isExpanded}
					<button
						type="button"
						class="desktop-no-drag rounded-md p-1.5 text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
						onclick={ontoggledetailpanel}
						disabled={!detailpanelavailable}
						aria-pressed={detailpanelopen}
						aria-label="Toggle contextual detail panel"
						title={detailpanelavailable
							? 'Toggle contextual detail panel (Ctrl+Shift+R)'
							: 'No contextual detail panel for this view'}
					>
						<svg
							class="h-4.5 w-4.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h10M4 18h16" />
						</svg>
					</button>
				{/if}
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
					title={showKeyboardHints ? 'Open command palette (Ctrl+P)' : 'Open command palette'}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
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
		{/if}
	</div>
</header>
