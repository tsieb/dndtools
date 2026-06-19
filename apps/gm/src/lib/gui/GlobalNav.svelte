<script lang="ts">
	import Icon from './Icon.svelte';
	import Dialog from './a11y/Dialog.svelte';
	import PinnedRecentStrip from './ux-shell/PinnedRecentStrip.svelte';
	import {
		splitForTabBar,
		shortcutHint,
		type GlobalNavItem,
	} from '$lib/navigation/global-nav';
	import type { NavEntry } from '$lib/platform/navigation-history';
	import type { ViewportClass, DeviceOrientation } from '$lib/platform/platform-profile.svelte';

	/**
	 * UX-SHELL — the seven-section global navigation surface (UX-NAV-002/004/005/006/009/015).
	 *
	 * One actor-filtered item set ({@link items}) is rendered through a profile-appropriate
	 * presentation so Desktop, Tablet, and Mobile expose the *same* sections in the *same*
	 * canonical order — only the control surface changes (platform parity):
	 *
	 * - Desktop (expanded): a persistent labeled sidebar with an icon-rail collapse mode
	 *   (UX-NAV-004). The collapse toggle is never the default state.
	 * - Tablet landscape (medium): an icon+label rail (UX-NAV-005).
	 * - Tablet portrait (medium) / Mobile (compact): a bottom tab bar with ≤ 5 destinations and a
	 *   "More" sheet for the overflow (UX-NAV-005 / UX-NAV-006).
	 *
	 * UX-NAV-015: the pinned/recent strip sits between the Command Center item and the section list
	 * in the sidebar/rail, and at the top of the "More" sheet on the compact tab bar. The strip data
	 * is actor-filtered upstream, so it never leaks a destination the active actor cannot reach.
	 *
	 * The element is the single `<nav aria-label="Primary navigation">` landmark (UX-NAV-009). Each
	 * item is an `<a>` with `aria-current="page"` when active — plain navigation links, not a
	 * `role="tab"` widget, since activating one routes rather than swapping an in-view panel; this
	 * keeps the landmark/heading structure and the axe landmark audit clean. DM-only / observer-hidden
	 * sections are simply ABSENT from {@link items} (actor-filtered upstream), never hidden, so no
	 * navigation path leaks them (UX-NAV-013).
	 */
	interface Props {
		items: GlobalNavItem[];
		viewportClass: ViewportClass;
		orientation: DeviceOrientation;
		/** Desktop icon-rail collapse state (UX-NAV-004). */
		collapsed: boolean;
		onToggleCollapse: () => void;
		/** Suppress hover-only tooltips under touch modality (UX-NAV-018). */
		touch: boolean;
		/** UX-NAV-015: actor-filtered pinned destinations (already reachability-filtered). */
		pinned?: NavEntry[];
		/** UX-NAV-015: actor-filtered recent destinations (already reachability-filtered). */
		recent?: NavEntry[];
		/** Unpin a destination from the strip (device-local preference). */
		onUnpin?: (entry: NavEntry) => void;
	}

	let {
		items,
		viewportClass,
		orientation,
		collapsed,
		onToggleCollapse,
		touch,
		pinned = [],
		recent = [],
		onUnpin = () => {},
	}: Props = $props();

	// Presentation decision (platform parity: same items, different surface).
	const isSidebar = $derived(viewportClass === 'expanded');
	const isRail = $derived(viewportClass === 'medium' && orientation === 'landscape');
	const isTabBar = $derived(
		viewportClass === 'compact' || (viewportClass === 'medium' && orientation === 'portrait'),
	);
	// Icon-rail = Desktop sidebar collapsed OR the Tablet landscape rail (both icon-forward).
	const iconOnly = $derived((isSidebar && collapsed) || isRail);

	const surface = $derived(isSidebar ? 'sidebar' : isRail ? 'rail' : 'tabbar');

	// Bottom tab bar: ≤ 5 destinations + a "More" overflow sheet (UX-NAV-005/006).
	const tabLayout = $derived(splitForTabBar(items));
	const visibleItems = $derived(isTabBar ? tabLayout.primary : items);
	const overflowItems = $derived(isTabBar ? tabLayout.overflow : []);

	// UX-NAV-015: in the sidebar/rail the Command Center home anchors the top, the strip sits below
	// it, and the remaining sections (Session…Settings) fill the rest, so the strip lands "below the
	// Command Center item and above the section list" (UX-NAV-015 AC1).
	// Design-package rail grouping: "Library" = Command Center + the sections; Settings is pinned at
	// the foot, divider-separated (UX-NAV-002 keeps Settings `last`).
	const libraryItems = $derived(items.filter((item) => !item.last));
	const settingsItem = $derived(items.find((item) => item.last) ?? null);

	const stripHasContent = $derived(pinned.length > 0 || recent.length > 0);
	// The "More" sheet hosts the overflow sections AND the pinned/recent strip; surface it whenever
	// either has content so the strip stays reachable on the compact tab bar even with no overflow.
	const showMore = $derived(isTabBar && (overflowItems.length > 0 || stripHasContent));

	let moreOpen = $state(false);
	const moreActive = $derived(overflowItems.some((item) => item.active));
</script>

{#snippet navLink(item: GlobalNavItem)}
	<a
		class="global-nav-item"
		href={item.route}
		data-testid={`nav-${item.id}`}
		data-active={item.active ? 'true' : 'false'}
		aria-current={item.active ? 'page' : undefined}
		title={iconOnly && !touch ? item.title : undefined}
	>
		<span class="global-nav-icon"><Icon name={item.icon} size="md" /></span>
		<!-- Full section title in the sidebar/rail (matches the package); the width-constrained
		     compact tab bar keeps the short label. -->
		<span class="global-nav-label">{isTabBar ? item.shortLabel : item.title}</span>
		<!-- Keyboard shortcut hint, shown in the labeled sidebar (UX-NAV-002/019). -->
		{#if isSidebar && !collapsed}
			<kbd class="global-nav-kbd">{shortcutHint(item)}</kbd>
		{/if}
		<!-- Accessible name is always the full title, even in icon-only states (UX-NAV-004). -->
		<span class="visually-hidden">{item.title}</span>
	</a>
{/snippet}

<nav
	class="global-nav"
	aria-label="Primary navigation"
	data-testid="primary-nav"
	data-surface={surface}
	data-icon-only={iconOnly ? 'true' : 'false'}
	data-input-touch={touch ? 'true' : 'false'}
>
	{#if isTabBar}
		<!-- Compact bottom tab bar: a single row of ≤ 5 destinations + a "More" overflow button. -->
		<ul class="global-nav-list">
			{#each visibleItems as item (item.id)}
				<li class:nav-item-last={item.last}>{@render navLink(item)}</li>
			{/each}

			{#if showMore}
				<li>
					<button
						type="button"
						class="global-nav-item global-nav-more"
						data-testid="nav-more"
						data-active={moreActive ? 'true' : 'false'}
						aria-haspopup="dialog"
						aria-expanded={moreOpen}
						onclick={() => (moreOpen = true)}
					>
						<span class="global-nav-icon"
							><Icon name="more" size="md" label="More sections" /></span
						>
						<span class="global-nav-label">More</span>
					</button>
				</li>
			{/if}
		</ul>
	{:else}
		<!-- Sidebar / rail (design-package shell): the brand anchors the top, then the "Library"
		     group (Command Center + sections), the pinned/recent strip, and Settings pinned at the
		     foot. The brand is the single app-brand home link — it moved out of the top bar so the bar
		     can carry the route title, matching the package. -->
		<a
			class="global-nav-brand"
			href="/"
			data-testid="app-brand"
			aria-label="DND Tools — Command Center home"
			title={iconOnly && !touch ? 'DND Tools — Command Center' : undefined}
		>
			<span class="global-nav-brand-mark" aria-hidden="true"><Icon name="dice" size="sm" /></span>
			<span class="global-nav-brand-word">DND<span class="global-nav-brand-accent">Tools</span></span>
		</a>

		{#if !iconOnly}
			<p class="global-nav-group-label">Library</p>
		{/if}
		<ul class="global-nav-list global-nav-list--library">
			{#each libraryItems as item (item.id)}
				<li>{@render navLink(item)}</li>
			{/each}
		</ul>

		{#if stripHasContent}
			<PinnedRecentStrip {pinned} {recent} {onUnpin} {iconOnly} {touch} variant="rail" />
		{/if}

		{#if settingsItem}
			<ul class="global-nav-list global-nav-list--footer">
				<li class="nav-item-last">{@render navLink(settingsItem)}</li>
			</ul>
		{/if}

		{#if isSidebar}
			<!-- UX-NAV-004: icon-rail collapse toggle. Never the default state on first launch. -->
			<button
				type="button"
				class="global-nav-collapse"
				data-testid="nav-collapse-toggle"
				aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
				aria-pressed={collapsed}
				onclick={onToggleCollapse}
			>
				<Icon
					name="chevron-right"
					size="sm"
					label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
					class={collapsed ? 'global-nav-collapse-icon' : 'global-nav-collapse-icon is-expanded'}
				/>
			</button>
		{/if}
	{/if}
</nav>

<!-- UX-NAV-005/006/015: the "More" overflow sheet. Reuses the shared focus-trapped Dialog so focus
     is trapped, Escape closes, and focus returns to the trigger. Closed = not in the DOM. The
     pinned/recent strip sits at the top of the sheet (UX-NAV-015 Mobile). -->
{#if showMore}
	<Dialog bind:open={moreOpen} title="More sections" testid="nav-more-sheet">
		{#if stripHasContent}
			<PinnedRecentStrip {pinned} {recent} {onUnpin} variant="sheet" />
		{/if}
		<ul class="global-nav-sheet-list">
			{#each overflowItems as item (item.id)}
				<li>
					<a
						class="global-nav-sheet-item"
						href={item.route}
						data-testid={`nav-${item.id}`}
						data-active={item.active ? 'true' : 'false'}
						aria-current={item.active ? 'page' : undefined}
						onclick={() => (moreOpen = false)}
					>
						<span class="global-nav-icon"><Icon name={item.icon} size="md" /></span>
						<span class="global-nav-label">{item.title}</span>
					</a>
				</li>
			{/each}
		</ul>
	</Dialog>
{/if}
