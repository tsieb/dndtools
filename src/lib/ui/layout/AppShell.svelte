<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
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

	let lastLayoutTier = $state<'compact' | 'medium' | 'expanded' | null>(null);
	let sheetHistoryPushed = $state(false);
	let swipeStartX = $state(0);
	let swipeStartY = $state(0);
	let swipeStartTime = $state(0);
	let swipeIntent = $state<'open-sheet' | null>(null);
	let sheetDragStartY = $state(0);
	let sheetDragStartX = $state(0);
	let sheetDragOffset = $state(0);
	let sheetDragActive = $state(false);
	let lastPathname = $state<string | null>(null);

	const compactEditorMode = $derived.by(() => {
		if (!layoutState.isCompact) return false;
		return /^\/knowledge\/notes\/[^/]+\/edit$/.test(page.url.pathname);
	});

	$effect(() => {
		if (!mobileKeyboardState.keyboardOpen || !ui.sidebarOpen) return;
		closeCompactSheet(false);
	});

	$effect(() => {
		const tier = layoutState.tier;
		const initialCompactMount = tier === 'compact' && lastLayoutTier === null;
		const transitionedToCompact =
			tier === 'compact' && lastLayoutTier !== null && lastLayoutTier !== 'compact';
		if ((initialCompactMount || transitionedToCompact) && ui.sidebarOpen) {
			closeCompactSheet(false);
		}
		lastLayoutTier = tier;
	});

	$effect(() => {
		if (!compactEditorMode || !ui.sidebarOpen) return;
		closeCompactSheet(false);
	});

	$effect(() => {
		const pathname = page.url.pathname;
		if (lastPathname === null) {
			lastPathname = pathname;
			return;
		}
		if (pathname !== lastPathname && ui.sidebarOpen && layoutState.isCompact) {
			closeCompactSheet(false);
		}
		lastPathname = pathname;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!layoutState.isCompact || compactEditorMode) {
			sheetHistoryPushed = false;
			return;
		}
		if (!ui.sidebarOpen || sheetHistoryPushed) return;
		const currentState =
			window.history.state && typeof window.history.state === 'object'
				? (window.history.state as Record<string, unknown>)
				: {};
		window.history.pushState(
			{
				...currentState,
				dndtoolsCompactSheet: true,
			},
			'',
			window.location.href,
		);
		sheetHistoryPushed = true;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const handlePopstate = (): void => {
			if (!layoutState.isCompact || !ui.sidebarOpen) {
				sheetHistoryPushed = false;
				return;
			}
			closeCompactSheet(false);
		};
		window.addEventListener('popstate', handlePopstate);
		return () => {
			window.removeEventListener('popstate', handlePopstate);
		};
	});

	const primaryNavMode = $derived.by<'expanded' | 'collapsed' | 'medium' | 'compact'>(() => {
		if (layoutState.isCompact) return 'compact';
		if (layoutState.isMedium) return 'medium';
		return ui.sidebarOpen ? 'expanded' : 'collapsed';
	});

	const sheetStyle = $derived.by(() => `transform: translateY(${Math.round(sheetDragOffset)}px);`);

	function openCompactSheet(): void {
		if (!layoutState.isCompact || ui.focusReading || compactEditorMode) return;
		ui.sidebarOpen = true;
	}

	function closeCompactSheet(syncHistory = true): void {
		if (!ui.sidebarOpen) {
			sheetHistoryPushed = false;
			return;
		}
		ui.sidebarOpen = false;
		if (syncHistory && sheetHistoryPushed && typeof window !== 'undefined') {
			sheetHistoryPushed = false;
			window.history.back();
			return;
		}
		sheetHistoryPushed = false;
	}

	function handleMainTouchStart(event: TouchEvent): void {
		if (!layoutState.isCompact || ui.focusReading || compactEditorMode || ui.sidebarOpen) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const edgeThreshold = 26;
		if (touch.clientX > edgeThreshold) {
			swipeIntent = null;
			return;
		}
		swipeIntent = 'open-sheet';
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
		if (deltaX < 0 || Math.abs(deltaY) > Math.abs(deltaX) + 8) {
			swipeIntent = null;
		}
	}

	function handleMainTouchEnd(event: TouchEvent): void {
		if (!swipeIntent) return;
		const touch = event.changedTouches[0];
		if (!touch) {
			swipeIntent = null;
			return;
		}
		const deltaX = touch.clientX - swipeStartX;
		const deltaY = touch.clientY - swipeStartY;
		const elapsedMs = Date.now() - swipeStartTime;
		if (deltaX >= 90 && Math.abs(deltaY) <= 70 && elapsedMs <= 700) {
			openCompactSheet();
		}
		swipeIntent = null;
	}

	function handleSheetKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		closeCompactSheet();
	}

	function handleSheetBackdrop(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		closeCompactSheet();
	}

	function handleSheetTouchStart(event: TouchEvent): void {
		const touch = event.changedTouches[0];
		if (!touch) return;
		sheetDragStartY = touch.clientY;
		sheetDragStartX = touch.clientX;
		sheetDragOffset = 0;
		sheetDragActive = true;
	}

	function handleSheetTouchMove(event: TouchEvent): void {
		if (!sheetDragActive) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const deltaY = touch.clientY - sheetDragStartY;
		const deltaX = touch.clientX - sheetDragStartX;
		if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) + 8) {
			sheetDragOffset = 0;
			return;
		}
		sheetDragOffset = Math.min(deltaY, 180);
	}

	function handleSheetTouchEnd(event: TouchEvent): void {
		if (!sheetDragActive) return;
		const touch = event.changedTouches[0];
		const deltaY = touch ? touch.clientY - sheetDragStartY : 0;
		const shouldClose = deltaY >= 90;
		sheetDragActive = false;
		sheetDragOffset = 0;
		if (shouldClose) {
			closeCompactSheet();
		}
	}
</script>

<a href="#main-content" class="skip-nav">Skip to content</a>

<div class="flex h-screen overflow-hidden">
	{#if !ui.focusReading && !compactEditorMode}
		<PrimaryNav mode={primaryNavMode} />
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		{#if !ui.focusReading}
			<TopBar {onsearch} {onsetplayermode} />
		{/if}

		<div class="flex min-h-0 flex-1 overflow-hidden">
			{#if ui.sidebarOpen && !ui.focusReading && !layoutState.isCompact && !compactEditorMode}
				<Sidebar {onnewnote} {ondice} {ontemplate} {onsetplayermode} />
			{/if}

			<main
				id="main-content"
				class="app-main flex-1 overflow-y-auto bg-parchment dark:bg-tavern-bg {layoutState.isCompact &&
				!ui.focusReading &&
				!compactEditorMode &&
				!mobileKeyboardState.keyboardOpen
					? 'pb-[calc(var(--layout-bottomnav-height)+env(safe-area-inset-bottom)+0.75rem)]'
					: ''}"
				ontouchstart={handleMainTouchStart}
				ontouchmove={handleMainTouchMove}
				ontouchend={handleMainTouchEnd}
			>
				{#if !ui.focusReading && !compactEditorMode}
					<LocationBar />
				{/if}
				<div class="h-full min-h-0 animate-fade-in">
					{@render children()}
				</div>
			</main>
		</div>
	</div>

	{#if layoutState.isCompact && ui.sidebarOpen && !ui.focusReading && !compactEditorMode && !mobileKeyboardState.keyboardOpen}
		<div
			class="fixed inset-0 z-30 bg-black/35"
			onclick={handleSheetBackdrop}
			onkeydown={handleSheetKeydown}
			role="button"
			aria-label="Close local navigation sheet"
			tabindex="-1"
		>
			<div
				class="fixed inset-x-0 bottom-0 z-40 h-[70vh] max-h-[70vh] overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl transition-transform duration-150 dark:border-tavern-border dark:bg-tavern-surface"
				style={sheetStyle}
				role="dialog"
				aria-modal="true"
				aria-label="Local navigation sheet"
				tabindex="0"
				use:focusTrap
				onkeydown={handleSheetKeydown}
				ontouchstart={handleSheetTouchStart}
				ontouchmove={handleSheetTouchMove}
				ontouchend={handleSheetTouchEnd}
			>
				<div class="flex justify-center pb-1 pt-2">
					<div class="h-1.5 w-12 rounded-full bg-border dark:bg-tavern-border"></div>
				</div>
				<Sidebar {onnewnote} {ondice} {ontemplate} {onsetplayermode} presentation="sheet" />
			</div>
		</div>
	{/if}

	{#if layoutState.isCompact && !ui.focusReading && !compactEditorMode && !ui.sidebarOpen && !mobileKeyboardState.keyboardOpen}
		<button
			type="button"
			class="compact-browse-pill fixed left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink shadow-lg transition-[transform,colors] active:scale-[0.97] active:brightness-95 dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-text"
			style="bottom: calc(var(--layout-bottomnav-height) + env(safe-area-inset-bottom) + 0.5rem);"
			onclick={openCompactSheet}
			aria-haspopup="dialog"
			aria-expanded={ui.sidebarOpen}
		>
			Browse
		</button>
	{/if}
</div>
