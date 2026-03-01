<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ui } from '$lib/state/ui.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import {
		closeDesktopWindow,
		getDesktopWindowState,
		minimizeDesktopWindow,
		onDesktopWindowStateChange,
		toggleDesktopWindowMaximize,
	} from '$lib/platform/desktop/bridge.js';
	import ThemeToggle from '$lib/ui/common/ThemeToggle.svelte';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
		ontemplate: (folderOverride?: string) => void;
		onrefresh: () => void;
	}

	let { onnewnote, onsearch, ontemplate, onrefresh }: Props = $props();
	let isMaximized = $state(false);
	let createMenuOpen = $state(false);
	let createMenuAnchor = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!createMenuOpen || typeof window === 'undefined') return;
		const onPointerDown = (event: MouseEvent): void => {
			if (!(event.target instanceof Node)) return;
			if (createMenuAnchor?.contains(event.target)) return;
			createMenuOpen = false;
		};
		window.addEventListener('mousedown', onPointerDown);
		return () => window.removeEventListener('mousedown', onPointerDown);
	});

	onMount(() => {
		void getDesktopWindowState()
			.then((state) => (isMaximized = state.isMaximized))
			.catch(() => undefined);

		return onDesktopWindowStateChange((state) => {
			isMaximized = state.isMaximized;
		});
	});
</script>

<header
	class="h-[52px] flex items-center justify-between px-3 border-b border-border dark:border-tavern-border bg-surface/88 dark:bg-tavern-surface/88 backdrop-blur-md shrink-0 desktop-drag"
>
	<div class="flex items-center gap-3 min-w-0">
		<button
			class="desktop-no-drag p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
			onclick={() => ui.toggleSidebar()}
			aria-label="Toggle sidebar"
			title="Toggle sidebar (Ctrl+B)"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		<button
			class="desktop-no-drag p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
			onclick={() => window.history.back()}
			disabled={!navigationState.canGoBack}
			aria-label="Go back"
			title={navigationState.backEntry
				? `Back to ${navigationState.backEntry.label}`
				: 'No previous location'}
		>
			<svg
				class="w-4.5 h-4.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<button
			class="desktop-no-drag p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
			onclick={() => window.history.forward()}
			disabled={!navigationState.canGoForward}
			aria-label="Go forward"
			title={navigationState.forwardEntry
				? `Forward to ${navigationState.forwardEntry.label}`
				: 'No forward location'}
		>
			<svg
				class="w-4.5 h-4.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
		<a href={resolve('/')} class="desktop-no-drag flex items-center gap-2 group min-w-0">
			<img
				src="/app-icon.svg"
				alt=""
				class="w-7 h-7 rounded-md shadow-sm ring-1 ring-black/10 dark:ring-white/10"
			/>
			<span
				class="text-base font-semibold text-ink dark:text-tavern-text tracking-tight group-hover:text-accent dark:group-hover:text-tavern-accent transition-colors"
			>
				DND Tools
			</span>
		</a>
	</div>

	<div class="flex items-center gap-1 desktop-no-drag">
		<button
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
			onclick={onrefresh}
			aria-label="Refresh vault"
			title="Refresh vault from disk"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4 4v5h.582M20 20v-5h-.581M5.161 9A7 7 0 0118.84 8M18.84 15a7 7 0 01-13.678 1"
				/>
			</svg>
		</button>
		<button
			class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-ink-faint dark:text-tavern-faint bg-surface-alt dark:bg-tavern-surface-alt hover:bg-border dark:hover:bg-tavern-border transition-colors mr-1"
			onclick={onsearch}
			aria-label="Search"
			title="Quick search (Ctrl+P)"
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<span class="hidden sm:inline">Search</span>
			<kbd class="hidden sm:inline text-xs font-mono opacity-60">Ctrl+P</kbd>
		</button>
		<div class="relative" bind:this={createMenuAnchor}>
			<button
				class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-accent-subtle dark:hover:bg-tavern-accent-subtle hover:text-accent dark:hover:text-tavern-accent transition-colors"
				onclick={() => (createMenuOpen = !createMenuOpen)}
				aria-label="New note options"
				title="New note options (Ctrl+N)"
				aria-haspopup="menu"
				aria-expanded={createMenuOpen}
			>
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
			</button>
			{#if createMenuOpen}
				<div
					class="absolute right-0 mt-1 w-48 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-lg z-30 overflow-hidden"
					role="menu"
					aria-label="Create note menu"
				>
					<button
						type="button"
						class="w-full text-left px-3 py-2 text-sm text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
						onclick={() => {
							createMenuOpen = false;
							onnewnote();
						}}
						role="menuitem"
					>
						New note
					</button>
					<button
						type="button"
						class="w-full text-left px-3 py-2 text-sm text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
						onclick={() => {
							createMenuOpen = false;
							ontemplate();
						}}
						role="menuitem"
					>
						Create from template
					</button>
				</div>
			{/if}
		</div>
		<div class="hidden sm:block ml-1">
			<ThemeToggle />
		</div>
		{#if vaultHealthState.severity !== 'none'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a
				href={`${resolve('/settings')}?tab=vault`}
				class="relative p-1.5 rounded-md transition-colors {vaultHealthState.severity === 'critical'
					? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
					: vaultHealthState.severity === 'warning'
						? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
				aria-label="Vault integrity issues detected"
				title="{vaultHealthState.issueCount} vault integrity {vaultHealthState.issueCount === 1
					? 'issue'
					: 'issues'} detected — click to review"
			>
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
					/>
				</svg>
				<span
					class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[10px] leading-4 text-center {vaultHealthState.severity ===
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
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href={`${resolve('/settings')}?tab=mcp#mcp-changes`}
			class="relative p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
			aria-label="Pending MCP changes"
			title="Review pending MCP changes"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
				/>
			</svg>
			{#if mcpChangesState.count > 0}
				<span
					class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-warning dark:bg-tavern-warning text-white text-[10px] leading-4 text-center"
				>
					{mcpChangesState.count}
				</span>
			{/if}
		</a>
		<a
			href={resolve('/settings')}
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
			aria-label="Settings"
			title="Open settings"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		</a>
		<div class="ml-2 mr-1 h-6 w-px bg-border dark:bg-tavern-border"></div>
		<div
			class="flex items-center rounded-md overflow-hidden border border-border dark:border-tavern-border"
		>
			<button
				class="w-9 h-8 flex items-center justify-center text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={() => void minimizeDesktopWindow()}
				aria-label="Minimize window"
				title="Minimize"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
				</svg>
			</button>
			<button
				class="w-9 h-8 flex items-center justify-center text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors border-x border-border dark:border-tavern-border"
				onclick={() => void toggleDesktopWindowMaximize()}
				aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
				title={isMaximized ? 'Restore' : 'Maximize'}
			>
				{#if isMaximized}
					<svg
						class="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 9h9v9H9V9z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h9v2H8v7H6V6z" />
					</svg>
				{:else}
					<svg
						class="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="6" y="6" width="12" height="12" rx="1" />
					</svg>
				{/if}
			</button>
			<button
				class="w-9 h-8 flex items-center justify-center text-ink-muted dark:text-tavern-muted hover:bg-red-600 hover:text-white transition-colors"
				onclick={() => void closeDesktopWindow()}
				aria-label="Close window"
				title="Close"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
	</div>
</header>
