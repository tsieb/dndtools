<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import TopBar from './TopBar.svelte';
	import PrimaryNav from './PrimaryNav.svelte';
	import Sidebar from './Sidebar.svelte';
	import LocationBar from '$lib/ui/navigation/LocationBar.svelte';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
		ondice: () => void;
		ontemplate: (folderOverride?: string) => void;
		onsetplayermode: (enabled: boolean) => void;
		children: Snippet;
	}

	let { onnewnote, onsearch, ondice, ontemplate, onsetplayermode, children }: Props = $props();

	let swipeStartX = $state(0);
	let swipeStartY = $state(0);
	let swipeStartTime = $state(0);
	let swipeIntent = $state<'back' | 'forward' | null>(null);
	let lastLayoutTier = $state<'compact' | 'medium' | 'expanded' | null>(null);

	$effect(() => {
		if (!mobileKeyboardState.keyboardOpen) return;
		if (ui.sidebarOpen) {
			ui.sidebarOpen = false;
		}
	});

	$effect(() => {
		const tier = layoutState.tier;
		const initialCompactMount = tier === 'compact' && lastLayoutTier === null;
		const transitionedToCompact =
			tier === 'compact' && lastLayoutTier !== null && lastLayoutTier !== 'compact';
		if ((initialCompactMount || transitionedToCompact) && ui.sidebarOpen) {
			ui.sidebarOpen = false;
		}
		lastLayoutTier = tier;
	});

	const primaryNavMode = $derived.by<'expanded' | 'collapsed' | 'medium' | 'compact'>(() => {
		if (layoutState.isCompact) return 'compact';
		if (layoutState.isMedium) return 'medium';
		return ui.sidebarOpen ? 'expanded' : 'collapsed';
	});

	function handleMainTouchStart(event: TouchEvent): void {
		if (!layoutState.isCompact || ui.focusReading || ui.sidebarOpen) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const edgeThreshold = 28;
		if (touch.clientX <= edgeThreshold) {
			swipeIntent = 'back';
		} else if (touch.clientX >= layoutState.viewportWidth - edgeThreshold) {
			swipeIntent = 'forward';
		} else {
			swipeIntent = null;
		}
		swipeStartX = touch.clientX;
		swipeStartY = touch.clientY;
		swipeStartTime = Date.now();
	}

	function handleMainTouchMove(event: TouchEvent): void {
		if (!swipeIntent) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const deltaX = touch.clientX - swipeStartX;
		const deltaY = touch.clientY - swipeStartY;
		if (Math.abs(deltaY) > Math.abs(deltaX)) {
			swipeIntent = null;
		}
	}

	function handleMainTouchEnd(event: TouchEvent): void {
		if (!swipeIntent) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const deltaX = touch.clientX - swipeStartX;
		const deltaY = touch.clientY - swipeStartY;
		const elapsedMs = Date.now() - swipeStartTime;
		const horizontalThreshold = 90;
		const verticalThreshold = 70;
		if (elapsedMs > 700 || Math.abs(deltaY) > verticalThreshold) {
			swipeIntent = null;
			return;
		}

		if (swipeIntent === 'back' && deltaX >= horizontalThreshold && navigationState.canGoBack) {
			window.history.back();
		}
		if (
			swipeIntent === 'forward' &&
			deltaX <= -horizontalThreshold &&
			navigationState.canGoForward
		) {
			window.history.forward();
		}
		swipeIntent = null;
	}
</script>

<a href="#main-content" class="skip-nav">Skip to content</a>

<div class="flex h-screen overflow-hidden">
	{#if !ui.focusReading}
		<PrimaryNav mode={primaryNavMode} />
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		{#if !ui.focusReading}
			<TopBar {onsearch} />
		{/if}

		<div class="flex min-h-0 flex-1 overflow-hidden">
			{#if ui.sidebarOpen && !ui.focusReading && !layoutState.isCompact}
				<Sidebar {onnewnote} {ondice} {ontemplate} {onsetplayermode} />
			{/if}

			<main
				id="main-content"
				class="app-main flex-1 overflow-y-auto bg-parchment dark:bg-tavern-bg {layoutState.isCompact &&
				!ui.focusReading &&
				!mobileKeyboardState.keyboardOpen
					? 'pb-[calc(var(--layout-bottomnav-height)+env(safe-area-inset-bottom)+0.75rem)]'
					: ''}"
				ontouchstart={handleMainTouchStart}
				ontouchmove={handleMainTouchMove}
				ontouchend={handleMainTouchEnd}
			>
				{#if !ui.focusReading}
					<LocationBar />
				{/if}
				<div class="h-full min-h-0 animate-fade-in">
					{@render children()}
				</div>
			</main>
		</div>
	</div>

	{#if layoutState.isCompact && ui.sidebarOpen && !ui.focusReading}
		<button
			class="fixed inset-0 z-30 bg-black/35"
			onclick={() => (ui.sidebarOpen = false)}
			aria-label="Close local navigation sheet"
		></button>
		<div
			class="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl dark:border-tavern-border dark:bg-tavern-surface"
			role="dialog"
			aria-label="Local navigation sheet"
			use:focusTrap
		>
			<Sidebar {onnewnote} {ondice} {ontemplate} {onsetplayermode} presentation="sheet" />
		</div>
	{/if}
</div>
