<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { syncState } from '$lib/state/sync.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import Icon from '$lib/ui/common/Icon.svelte';
	import HelpTip from '$lib/ui/common/HelpTip.svelte';
	import type { SyncIndicatorState } from '$lib/types/sync.js';

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
	const mcpReviewEnabled = $derived(featureSettingsState.isAdvancedEnabled('mcp_staged_review'));
	const syncIndicator = $derived(syncState.indicator);
	const syncLabel = $derived.by(() => syncIndicatorLabel(syncIndicator));

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

	function syncIndicatorLabel(indicator: SyncIndicatorState): string {
		if (indicator === 'online') return 'Online';
		if (indicator === 'offline') return 'Offline';
		if (indicator === 'syncing') return 'Syncing';
		return 'Sync Error';
	}
</script>

<header
	class="h-[var(--layout-topbar-height)] shrink-0 border-b border-border bg-surface/88 px-3 backdrop-blur-md"
	role="banner"
>
	<div class="flex h-full items-center justify-between gap-2">
		{#if layoutState.isCompact}
			<div class="min-w-0 flex flex-1 items-center gap-1.5">
				{#if compactEditorMode}
					<button
						class="touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
						onclick={requestCompactEditorBack}
						aria-label="Done editing"
					>
						<Icon name="chevron-left" size="sm" />
					</button>
				{/if}
				<p class="truncate text-sm font-semibold text-ink">{routeTitle}</p>
			</div>

			<div class="relative ml-2 flex items-center gap-1.5">
				<button
					class="touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					onclick={onsearch}
					aria-label="Open command palette"
				>
					<Icon name="search" size="sm" />
				</button>
				<button
					bind:this={overflowButtonEl}
					class="touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					onclick={() => (overflowOpen = !overflowOpen)}
					aria-label="More actions"
					aria-haspopup="menu"
					aria-expanded={overflowOpen}
				>
					<Icon name="ellipsis" size="sm" />
				</button>

				{#if overflowOpen}
					<div
						bind:this={overflowMenuEl}
						class="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-48 rounded-lg border border-border bg-surface-elevated p-2 shadow-lg"
						role="menu"
						aria-label="Compact topbar overflow menu"
					>
						<a
							href={resolve('/settings')}
							class="block rounded px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-alt"
							role="menuitem"
							onclick={() => (overflowOpen = false)}
						>
							Settings
						</a>
						<a
							href={`${resolve('/settings')}?tab=sync`}
							class="mt-1 block rounded px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-alt"
							role="menuitem"
							onclick={() => (overflowOpen = false)}
						>
							Sync: {syncLabel}
						</a>
						<button
							type="button"
							class="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface-alt"
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
					class="desktop-no-drag touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					onclick={ontogglelocalpanel}
					aria-label="Toggle local navigation"
				>
					<Icon name="menu" size="md" />
				</button>
				{#if layoutState.isExpanded}
					<button
						type="button"
						class="desktop-no-drag touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent"
						onclick={ontoggledetailpanel}
						disabled={!detailpanelavailable}
						aria-pressed={detailpanelopen}
						aria-label="Toggle contextual detail panel"
					>
						<Icon name="panel-left" size="sm" />
					</button>
				{/if}
				<button
					class="desktop-no-drag touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent"
					onclick={() => window.history.back()}
					disabled={!navigationState.canGoBack}
					aria-label="Go back"
				>
					<Icon name="chevron-left" size="sm" />
				</button>
				<button
					class="desktop-no-drag touch-target rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt disabled:opacity-40 disabled:hover:bg-transparent"
					onclick={() => window.history.forward()}
					disabled={!navigationState.canGoForward}
					aria-label="Go forward"
				>
					<Icon name="chevron-right" size="sm" />
				</button>
				<div class="ml-1 min-w-0">
					<p class="truncate text-sm font-semibold text-ink">{routeTitle}</p>
				</div>
			</div>

			<div class="desktop-no-drag ml-2 flex items-center gap-1.5">
				<button
					class="touch-target-inline flex items-center gap-2 rounded-md bg-surface-alt px-2.5 py-1.5 text-sm text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-border"
					onclick={onsearch}
					aria-label="Open command palette"
				>
					<Icon name="search" size="xs" />
					<span class="hidden sm:inline">Command</span>
				</button>

				<a
					href={`${resolve('/settings')}?tab=sync`}
					class="touch-target-inline flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					aria-label={`Sync status: ${syncLabel}`}
				>
					<span
						class="h-2.5 w-2.5 rounded-full {syncIndicator === 'online'
							? 'bg-emerald-500'
							: syncIndicator === 'syncing'
								? 'bg-amber-500'
								: syncIndicator === 'offline'
									? 'bg-ink-faint'
									: 'bg-red-500'}"
						aria-hidden="true"
					></span>
					<span>{syncLabel}</span>
				</a>

				{#if sessionModeState.isActive}
					<span
						class="rounded-full border border-accent/45 bg-accent-subtle px-2.5 py-1 text-xs font-medium text-accent"
						role="status"
						aria-live="polite"
						aria-atomic="true"
					>
						Session active
					</span>
				{/if}

				{#if vaultHealthState.severity !== 'none'}
					<div class="relative">
						<a
							href={`${resolve('/settings')}?tab=vault`}
							class="touch-target relative rounded-md transition-[transform,colors] active:scale-[0.97] active:brightness-95 {vaultHealthState.severity ===
							'critical'
								? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
								: vaultHealthState.severity === 'warning'
									? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
									: 'text-ink-muted hover:bg-surface-alt'}"
							aria-label={`Vault integrity ${vaultHealthState.severity}: ${vaultHealthState.issueCount} issue${vaultHealthState.issueCount === 1 ? '' : 's'}`}
						>
							<Icon
								name={vaultHealthState.severity === 'critical' ? 'octagon-alert' : 'triangle-alert'}
								size="md"
							/>
							<span
								class="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-center text-2xs leading-4 text-white {vaultHealthState.severity ===
								'critical'
									? 'bg-red-600'
									: vaultHealthState.severity === 'warning'
										? 'bg-amber-500'
										: 'bg-ink-muted'}"
							>
								{vaultHealthState.issueCount}
							</span>
						</a>
						<span
							class="sr-only"
							role={vaultHealthState.severity === 'critical' ? 'alert' : 'status'}
							aria-live={vaultHealthState.severity === 'critical' ? 'assertive' : 'polite'}
							aria-atomic="true"
						>
							Vault health {vaultHealthState.severity}: {vaultHealthState.issueCount} issue{vaultHealthState.issueCount ===
							1
								? ''
								: 's'}
						</span>
					</div>
				{/if}

				{#if mcpReviewEnabled}
					<div class="flex items-center gap-1" data-help-target="mcp-staged-review-counter">
						<a
							href={`${resolve('/settings')}?tab=mcp#mcp-changes`}
							class="touch-target relative rounded-md text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
							aria-label="Pending MCP changes"
						>
							<Icon name="file-text" size="md" />
							{#if mcpChangesState.count > 0}
								<span
									class="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-warning px-1 text-center text-2xs leading-4 text-white"
								>
									{mcpChangesState.count}
								</span>
							{/if}
						</a>
						<HelpTip
							headline="MCP staged review"
							body="This counter shows AI-proposed vault changes waiting for your review. Keep staged review enabled when you want full control over edits before they are applied. Open it to approve or reject each proposed change."
							learnMoreHref={resolve('/settings') + '?tab=mcp#mcp-changes'}
							learnMoreLabel="Open MCP review"
						/>
						<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
							{mcpChangesState.count} pending MCP change{mcpChangesState.count === 1 ? '' : 's'}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</header>
