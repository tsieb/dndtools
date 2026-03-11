<script lang="ts">
	import { onMount } from 'svelte';
	import {
		closeDesktopWindow,
		getDesktopWindowState,
		minimizeDesktopWindow,
		onDesktopWindowStateChange,
		toggleDesktopWindowMaximize,
	} from '$lib/platform/desktop/bridge.js';
	import Icon from '$lib/ui/common/Icon.svelte';

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
	class="desktop-drag flex h-[var(--layout-desktop-titlebar-height)] shrink-0 items-center border-b border-border/80 bg-surface-alt/80 px-2 {isMac
		? 'pl-20'
		: ''}"
>
	<div class="desktop-no-drag min-w-0 px-1 text-xs text-ink-faint">DND Tools</div>
	{#if !isMac}
		<div class="desktop-no-drag ml-auto flex items-center gap-1.5 py-1">
			<button
				type="button"
				class="touch-target flex items-center justify-center rounded text-ink-muted transition-colors hover:bg-border/70"
				onclick={onMinimize}
				aria-label="Minimize window"
			>
				<Icon name="minus" size="xs" />
			</button>
			<button
				type="button"
				class="touch-target flex items-center justify-center rounded text-ink-muted transition-colors hover:bg-border/70"
				onclick={onToggleMaximize}
				aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
			>
				<Icon name="square" size="xs" />
			</button>
			<button
				type="button"
				class="touch-target flex items-center justify-center rounded text-ink-muted transition-colors hover:bg-red-600 hover:text-white"
				onclick={onClose}
				aria-label="Close window"
			>
				<Icon name="x" size="xs" />
			</button>
		</div>
	{/if}
</div>
