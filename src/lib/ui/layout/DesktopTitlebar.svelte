<script lang="ts">
	import { onMount } from 'svelte';
	import {
		closeDesktopWindow,
		getDesktopWindowState,
		minimizeDesktopWindow,
		onDesktopWindowStateChange,
		toggleDesktopWindowMaximize,
	} from '$lib/platform/desktop/bridge.js';

	let isMac = $state(false);
	let isMaximized = $state(false);

	onMount(() => {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) {
			return;
		}
		const platformLabel = navigator.platform || navigator.userAgent;
		isMac = /mac/i.test(platformLabel);

		void getDesktopWindowState()
			.then((state) => {
				isMaximized = state.isMaximized;
			})
			.catch(() => undefined);

		return onDesktopWindowStateChange((state) => {
			isMaximized = state.isMaximized;
		});
	});

	function onMinimize(): void {
		void minimizeDesktopWindow().catch(() => undefined);
	}

	function onToggleMaximize(): void {
		void toggleDesktopWindowMaximize().catch(() => undefined);
	}

	function onClose(): void {
		void closeDesktopWindow().catch(() => undefined);
	}
</script>

<div
	class="desktop-drag flex h-[var(--layout-desktop-titlebar-height)] shrink-0 items-center border-b border-border/80 bg-surface-alt/80 px-2 dark:border-tavern-border/80 dark:bg-tavern-surface-alt/80 {isMac
		? 'pl-20'
		: ''}"
>
	<div class="desktop-no-drag min-w-0 px-1 text-[11px] text-ink-faint dark:text-tavern-faint">
		DND Tools
	</div>
	{#if !isMac}
		<div class="desktop-no-drag ml-auto flex items-center">
			<button
				type="button"
				class="flex h-6 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:bg-border/70 dark:text-tavern-muted dark:hover:bg-tavern-border/70"
				onclick={onMinimize}
				aria-label="Minimize window"
				title="Minimize"
			>
				<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path d="M6 12h12" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
			<button
				type="button"
				class="flex h-6 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:bg-border/70 dark:text-tavern-muted dark:hover:bg-tavern-border/70"
				onclick={onToggleMaximize}
				aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
				title={isMaximized ? 'Restore' : 'Maximize'}
			>
				{#if isMaximized}
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M8 8h8v8H8z" stroke-width="2" />
						<path d="M6 6h8v2H8v6H6z" stroke-width="2" />
					</svg>
				{:else}
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<rect x="7" y="7" width="10" height="10" stroke-width="2" />
					</svg>
				{/if}
			</button>
			<button
				type="button"
				class="flex h-6 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:bg-red-600 hover:text-white dark:text-tavern-muted"
				onclick={onClose}
				aria-label="Close window"
				title="Close"
			>
				<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path d="M7 7l10 10M17 7L7 17" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	{/if}
</div>
