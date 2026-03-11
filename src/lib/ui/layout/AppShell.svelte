<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { navigationState, type PrimarySection } from '$lib/state/navigation.svelte.js';
	import {
		DEFAULT_LOCAL_PANEL_WIDTH,
		MAX_LOCAL_PANEL_WIDTH,
		MIN_LOCAL_PANEL_WIDTH,
		cycleLocalPanelWidthPreset,
		desktopShellState,
	} from '$lib/state/desktop-shell.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { detailPanelContextFromUrl } from '$lib/domain/detail-panel-context.js';
	import DesktopTitlebar from './DesktopTitlebar.svelte';
	import TopBar from './TopBar.svelte';
	import PrimaryNav from './PrimaryNav.svelte';
	import Sidebar from './Sidebar.svelte';
	import DetailPanel from './DetailPanel.svelte';
	import LocationBar from '$lib/ui/navigation/LocationBar.svelte';
	import { focusTrap } from '$lib/actions/focus-trap.js';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
		ondice: () => void;
		ontemplate: (folderOverride?: string) => void;
		onsetplayermode: (enabled: boolean) => void;
		onopenkeyboardshortcuts: () => void;
		children: Snippet;
	}

	let {
		onnewnote,
		onsearch,
		ondice,
		ontemplate,
		onsetplayermode,
		onopenkeyboardshortcuts,
		children,
	}: Props = $props();

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
	let lastRouteKey = $state<string | null>(null);
	let panelResizeActive = $state(false);
	let panelResizeStartX = $state(0);
	let panelResizeStartWidth = $state(0);
	let panelResizeSection = $state<PrimarySection>('knowledge');
	let panelResizeDraggedRecently = $state(false);
	let lastSessionActive = $state(false);
	let compactBarNow = $state(Date.now());

	$effect(() => {
		if (!sessionModeState.isActive || !layoutState.isCompact) return;
		const id = setInterval(() => {
			compactBarNow = Date.now();
		}, 1000);
		return () => clearInterval(id);
	});

	const compactSessionBarText = $derived.by(() => {
		const startedAt = sessionModeState.activeSession?.startedAt;
		if (!startedAt) return 'Session active';
		const startedMs = Date.parse(startedAt);
		if (!Number.isFinite(startedMs)) return 'Session active';
		const totalSeconds = Math.floor(Math.max(0, compactBarNow - startedMs) / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `Session — ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `Session — ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	});

	$effect(() => {
		desktopShellState.ensureHydrated();
	});

	const compactEditorMode = $derived.by(() => {
		if (!layoutState.isCompact) return false;
		return /^\/knowledge\/notes\/[^/]+\/edit$/.test(page.url.pathname);
	});

	const detailPanelContext = $derived(detailPanelContextFromUrl(page.url));
	const zenModeActive = $derived.by(
		() =>
			layoutState.isExpanded && desktopShellState.zenMode && !compactEditorMode && !ui.focusReading,
	);
	const detailPanelAvailable = $derived.by(
		() =>
			layoutState.isExpanded &&
			!ui.focusReading &&
			!compactEditorMode &&
			!zenModeActive &&
			detailPanelContext !== null,
	);
	const showInlineSidebar = $derived.by(() => {
		if (ui.focusReading || compactEditorMode || zenModeActive) return false;
		if (layoutState.isCompact) return false;
		if (layoutState.isMedium) return false;
		return !desktopShellState.localPanelCollapsed;
	});
	const mediumOverlayVisible = $derived.by(
		() =>
			layoutState.isMedium &&
			ui.sidebarOpen &&
			!ui.focusReading &&
			!compactEditorMode &&
			!zenModeActive,
	);
	const detailPanelVisible = $derived.by(
		() => detailPanelAvailable && desktopShellState.detailPanelOpen && !zenModeActive,
	);
	const desktopBridgeAvailable = $derived(
		typeof window !== 'undefined' && typeof window.dndtoolsDesktop !== 'undefined',
	);
	const activeSection = $derived(navigationState.activeSection);
	const activePanelWidth = $derived(desktopShellState.getLocalPanelWidth(activeSection));

	$effect(() => {
		if (!layoutState.isCompact || !mobileKeyboardState.keyboardOpen || !ui.sidebarOpen) return;
		closeCompactSheet(false);
	});

	$effect(() => {
		const tier = layoutState.tier;
		const initialCompactMount = tier === 'compact' && lastLayoutTier === null;
		const transitionedToCompact =
			tier === 'compact' && lastLayoutTier !== null && lastLayoutTier !== 'compact';
		const transitionedToMedium = tier === 'medium' && lastLayoutTier !== 'medium';
		if ((initialCompactMount || transitionedToCompact) && ui.sidebarOpen) {
			closeCompactSheet(false);
		}
		if (transitionedToMedium && ui.sidebarOpen) {
			closeMediumOverlay();
		}
		lastLayoutTier = tier;
	});

	$effect(() => {
		if (!compactEditorMode || !ui.sidebarOpen) return;
		closeCompactSheet(false);
	});

	$effect(() => {
		const routeKey = `${page.url.pathname}${page.url.search}`;
		if (lastRouteKey === null) {
			lastRouteKey = routeKey;
			return;
		}
		if (routeKey !== lastRouteKey && ui.sidebarOpen) {
			if (layoutState.isCompact) {
				closeCompactSheet(false);
			} else if (layoutState.isMedium) {
				closeMediumOverlay();
			}
		}
		lastRouteKey = routeKey;
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

	$effect(() => {
		if (!mediumOverlayVisible || typeof window === 'undefined') return;
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			closeMediumOverlay();
		};
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	$effect(() => {
		if (detailPanelAvailable) return;
		if (!desktopShellState.detailPanelOpen) return;
		desktopShellState.setDetailPanelOpen(false);
	});

	$effect(() => {
		if (!panelResizeActive || typeof window === 'undefined') return;
		const handlePointerMove = (event: PointerEvent): void => {
			if (!layoutState.isExpanded || zenModeActive) return;
			const delta = event.clientX - panelResizeStartX;
			if (Math.abs(delta) >= 3) panelResizeDraggedRecently = true;
			desktopShellState.setLocalPanelWidth(panelResizeSection, panelResizeStartWidth + delta);
		};
		const handlePointerEnd = (): void => {
			panelResizeActive = false;
		};
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerEnd);
		window.addEventListener('pointercancel', handlePointerEnd);
		return () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerEnd);
			window.removeEventListener('pointercancel', handlePointerEnd);
		};
	});

	$effect(() => {
		const isActive = sessionModeState.isActive;
		if (isActive && !lastSessionActive && layoutState.isExpanded && detailPanelAvailable) {
			desktopShellState.setDetailPanelOpen(true);
		}
		lastSessionActive = isActive;
	});

	const primaryNavMode = $derived.by<'expanded' | 'medium' | 'compact'>(() => {
		if (layoutState.isCompact) return 'compact';
		if (layoutState.isMedium) return 'medium';
		return 'expanded';
	});

	const sheetStyle = $derived.by(() => `transform: translateY(${Math.round(sheetDragOffset)}px);`);

	function openCompactSheet(): void {
		if (!layoutState.isCompact || ui.focusReading || compactEditorMode) return;
		ui.sidebarOpen = true;
	}

	function openMediumOverlay(): void {
		if (!layoutState.isMedium || ui.focusReading || compactEditorMode || zenModeActive) return;
		ui.sidebarOpen = true;
	}

	function closeMediumOverlay(): void {
		if (!layoutState.isMedium || !ui.sidebarOpen) return;
		ui.sidebarOpen = false;
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

	function toggleLocalPanel(): void {
		if (layoutState.isExpanded) {
			desktopShellState.toggleLocalPanelCollapsed();
			return;
		}
		if (layoutState.isMedium) {
			if (ui.sidebarOpen) {
				closeMediumOverlay();
			} else {
				openMediumOverlay();
			}
			return;
		}
		ui.toggleSidebar();
	}

	function handleMediumActiveSectionTap(section: PrimarySection): void {
		if (!layoutState.isMedium || navigationState.activeSection !== section) return;
		openMediumOverlay();
	}

	function handleMediumSectionNavigate(): void {
		if (!layoutState.isMedium || !ui.sidebarOpen) return;
		closeMediumOverlay();
	}

	function toggleDetailPanel(): void {
		if (!detailPanelAvailable) return;
		desktopShellState.toggleDetailPanel();
	}

	function exitZenMode(): void {
		desktopShellState.setZenMode(false);
	}

	function handlePanelResizePointerDown(event: PointerEvent): void {
		if (!layoutState.isExpanded || zenModeActive || desktopShellState.localPanelCollapsed) return;
		panelResizeActive = true;
		panelResizeDraggedRecently = false;
		panelResizeStartX = event.clientX;
		panelResizeStartWidth = activePanelWidth;
		panelResizeSection = activeSection;
		const currentTarget = event.currentTarget;
		if (currentTarget instanceof HTMLElement) {
			currentTarget.setPointerCapture(event.pointerId);
		}
	}

	function cycleLocalPanelWidth(direction: 'next' | 'previous'): void {
		if (!layoutState.isExpanded || zenModeActive || desktopShellState.localPanelCollapsed) return;
		const nextWidth = cycleLocalPanelWidthPreset(activePanelWidth, direction);
		desktopShellState.setLocalPanelWidth(activeSection, nextWidth);
	}

	function handlePanelResizeCycleClick(): void {
		if (panelResizeDraggedRecently) {
			panelResizeDraggedRecently = false;
			return;
		}
		cycleLocalPanelWidth('next');
	}

	function handlePanelResizeKeydown(event: KeyboardEvent): void {
		if (!layoutState.isExpanded || zenModeActive || desktopShellState.localPanelCollapsed) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const delta = event.key === 'ArrowLeft' ? -10 : 10;
			desktopShellState.setLocalPanelWidth(activeSection, activePanelWidth + delta);
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			cycleLocalPanelWidth('next');
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			desktopShellState.setLocalPanelWidth(activeSection, MIN_LOCAL_PANEL_WIDTH);
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			desktopShellState.setLocalPanelWidth(activeSection, MAX_LOCAL_PANEL_WIDTH);
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			desktopShellState.setLocalPanelWidth(activeSection, DEFAULT_LOCAL_PANEL_WIDTH);
		}
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

	function handleMediumOverlayKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		closeMediumOverlay();
	}

	function handleSheetBackdrop(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		closeCompactSheet();
	}

	function handleMediumOverlayBackdrop(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		closeMediumOverlay();
	}

	function handleSheetTouchStart(event: TouchEvent): void {
		if (ui.resolvedReducedMotion) return;
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

<div class="flex h-screen flex-col overflow-hidden">
	{#if desktopBridgeAvailable}
		<section aria-label="Window controls">
			<DesktopTitlebar />
		</section>
	{/if}

	<div class="flex min-h-0 flex-1 overflow-hidden">
		{#if !ui.focusReading && !compactEditorMode && !zenModeActive}
			<PrimaryNav
				mode={primaryNavMode}
				onmediumactivesectiontap={handleMediumActiveSectionTap}
				onmediumsectionnavigate={handleMediumSectionNavigate}
			/>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col">
			{#if !ui.focusReading && !zenModeActive}
				<TopBar
					{onsearch}
					{onsetplayermode}
					detailpanelavailable={detailPanelAvailable}
					detailpanelopen={desktopShellState.detailPanelOpen}
					ontogglelocalpanel={toggleLocalPanel}
					ontoggledetailpanel={toggleDetailPanel}
				/>
			{/if}

			<div class="relative flex min-h-0 flex-1 overflow-hidden">
				{#if showInlineSidebar}
					<Sidebar {onnewnote} {ondice} {ontemplate} {onsetplayermode} {onopenkeyboardshortcuts} />
					{#if layoutState.isExpanded}
						<section class="shrink-0" aria-label="Local navigation resize control">
							<button
								type="button"
								class="h-full w-3 shrink-0 cursor-col-resize bg-border/65 transition-colors hover:bg-accent/70 focus:bg-accent/70"
								aria-label="Resize local navigation panel"
								onpointerdown={handlePanelResizePointerDown}
								onkeydown={handlePanelResizeKeydown}
								onclick={handlePanelResizeCycleClick}
							></button>
						</section>
					{/if}
				{/if}

				<main
					id="main-content"
					class="app-main flex-1 overflow-y-auto bg-bg {layoutState.isCompact &&
					!ui.focusReading &&
					!compactEditorMode &&
					!mobileKeyboardState.keyboardOpen
						? `pb-[calc(var(--layout-bottomnav-height)+env(safe-area-inset-bottom)+${
								sessionModeState.isActive ? '1.75rem' : '0.75rem'
							})]`
						: ''}"
					ontouchstart={handleMainTouchStart}
					ontouchmove={handleMainTouchMove}
					ontouchend={handleMainTouchEnd}
				>
					{#if zenModeActive}
						<div class="relative">
							<LocationBar />
							<div
								class="pointer-events-none absolute right-3 top-2.5 z-30 flex items-start justify-end"
							>
								<button
									type="button"
									class="pointer-events-auto rounded-md border border-border bg-surface/92 px-2.5 py-1 text-xs font-medium text-ink shadow-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
									onclick={exitZenMode}
									aria-label="Exit zen mode"
								>
									Exit Zen
								</button>
							</div>
						</div>
					{:else if !ui.focusReading && !compactEditorMode}
						<LocationBar />
					{/if}
					<div class="h-full min-h-0 animate-fade-in">
						{@render children()}
					</div>
				</main>

				{#if detailPanelVisible && detailPanelContext}
					<aside
						class="detail-panel-enter h-full w-[var(--layout-detail-width)] shrink-0 overflow-y-auto border-l border-border bg-surface-alt/90"
						aria-label="Contextual detail panel"
						data-testid="detail-panel"
					>
						<DetailPanel context={detailPanelContext} />
					</aside>
				{/if}

				{#if mediumOverlayVisible}
					<div
						class="absolute inset-0 z-30"
						onclick={handleMediumOverlayBackdrop}
						onkeydown={handleMediumOverlayKeydown}
						role="button"
						aria-label="Close local navigation overlay"
						tabindex="-1"
					>
						<div class="absolute inset-0 bg-black/30"></div>
						<div
							class="absolute inset-y-0 left-0 z-10 overflow-hidden border-r border-border shadow-2xl"
							role="dialog"
							aria-modal="true"
							aria-label="Local navigation overlay"
						>
							<Sidebar
								{onnewnote}
								{ondice}
								{ontemplate}
								{onsetplayermode}
								{onopenkeyboardshortcuts}
								presentation="overlay"
							/>
						</div>
					</div>
				{/if}
			</div>
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
				class="fixed inset-x-0 bottom-0 z-40 h-[70vh] max-h-[70vh] overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl transition-transform duration-fast"
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
					<div class="h-1.5 w-12 rounded-full bg-border"></div>
				</div>
				<Sidebar
					{onnewnote}
					{ondice}
					{ontemplate}
					{onsetplayermode}
					{onopenkeyboardshortcuts}
					presentation="sheet"
				/>
			</div>
		</div>
	{/if}

	{#if layoutState.isCompact && !ui.focusReading && !compactEditorMode && !ui.sidebarOpen && !mobileKeyboardState.keyboardOpen}
		{#if sessionModeState.isActive}
			<div
				class="fixed inset-x-0 z-30 h-4 border-t border-border bg-accent-subtle text-center text-2xs font-medium text-accent"
				style="bottom: calc(var(--layout-bottomnav-height) + env(safe-area-inset-bottom));"
			>
				{compactSessionBarText}
			</div>
		{/if}
		<button
			type="button"
			class="compact-browse-pill fixed left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink shadow-lg transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			style="bottom: calc(var(--layout-bottomnav-height) + env(safe-area-inset-bottom) + {sessionModeState.isActive
				? '1.5rem'
				: '0.5rem'});"
			onclick={openCompactSheet}
			aria-haspopup="dialog"
			aria-expanded={ui.sidebarOpen}
		>
			Browse
		</button>
	{/if}
</div>
